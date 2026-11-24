"""Requirement mining: picks requirement statements out of extracted blocks.

A statement becomes a requirement candidate when it

* carries an explicit requirement identifier (``FR-12``, ``NFR-3``, ``REQ-7``…), or
* uses an obligation verb (shall / must / should / will / is required to …)
  with an actor rather than a document self-reference ("This section will…"), or
* sits in a table whose header marks a requirement / description column.

Lead-in sentences that end with a colon ("The system shall:") are combined
with the list items that follow them, so each bullet becomes a standalone
requirement.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.pdf_extractor import Block

_ID_RE = re.compile(
    r"^\s*\[?((?:REQ|FR|NFR|SR|UR|BR|SYS|SEC|PERF)[-_ ]?\d+(?:\.\d+)*)\]?\s*[:.)\-–—]?\s*",
    re.I,
)
_MODAL_RE = re.compile(
    r"\b(shall|must|should|will|is required to|are required to|needs to|need to|has to|have to)\b",
    re.I,
)
_OPTIONAL_RE = re.compile(r"\b(system|application|platform|portal|service|api|module)\s+may\b", re.I)
_SELF_REFERENCE = re.compile(
    r"^(this|the)\s+(document|section|chapter|specification|appendix|srs|table|figure)\b|"
    r"^(it|we)\s+will\b|^(readers?|you)\b",
    re.I,
)
_ABBREVIATIONS = re.compile(r"\b(e\.g|i\.e|etc|vs|approx|incl|min|max|no|fig|sec)\.", re.I)
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z(\"'])")
_MOSCOW = {
    "must": "Critical", "must have": "Critical", "critical": "Critical",
    "high": "High", "should": "High", "should have": "High",
    "medium": "Medium", "could": "Medium", "could have": "Medium",
    "low": "Low", "won't": "Low", "wont": "Low", "nice to have": "Low",
}


@dataclass
class Candidate:
    text: str
    section: str
    page: int
    block_position: int
    external_id: str | None = None
    priority_hint: str | None = None

    @property
    def key(self) -> str:
        return normalize(self.text)


def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9%]+", " ", text.lower()).strip()


def split_sentences(text: str) -> list[str]:
    protected = _ABBREVIATIONS.sub(lambda m: m.group(0).replace(".", "§"), text)
    parts = _SENTENCE_SPLIT.split(protected)
    return [p.replace("§", ".").strip() for p in parts if p.strip()]


def _strip_id(text: str) -> tuple[str, str | None]:
    m = _ID_RE.match(text)
    if m:
        return text[m.end():].strip(), m.group(1).upper().replace("_", "-").replace(" ", "-")
    return text.strip(), None


def is_requirement_sentence(text: str) -> bool:
    if len(text) < 20 or len(text) > 700:
        return False
    if _SELF_REFERENCE.search(text):
        return False
    return bool(_MODAL_RE.search(text) or _OPTIONAL_RE.search(text))


def _join_stem(stem: str, item: str) -> str:
    stem = stem.rstrip(": ").strip()
    item = item.strip().rstrip(";,")
    if item and item[0].isupper() and not item[:2].isupper():
        item = item[0].lower() + item[1:]
    joined = f"{stem} {item}"
    return joined if joined.endswith((".", "!", "?")) else joined + "."


def _table_candidates(block: Block) -> list[Candidate]:
    rows = block.table or []
    if len(rows) < 2:
        return []
    header = [h.lower() for h in rows[0]]
    text_col = next(
        (i for i, h in enumerate(header) if re.search(r"requirement|description|statement|criteria", h)),
        None,
    )
    id_col = next((i for i, h in enumerate(header) if re.search(r"\b(id|ref|no\.?|#|key)\b", h)), None)
    prio_col = next((i for i, h in enumerate(header) if re.search(r"priority|moscow|importance", h)), None)
    out: list[Candidate] = []
    for row in rows[1:]:
        cells = row + [""] * (len(header) - len(row))
        if text_col is not None:
            text = cells[text_col]
            if len(text) < 15:
                continue
        else:
            text = next((c for c in cells if is_requirement_sentence(c)), "")
            if not text:
                continue
        text, ext = _strip_id(text)
        if id_col is not None and cells[id_col] and _ID_RE.match(cells[id_col] + " "):
            ext = _strip_id(cells[id_col] + " x")[1] or ext
        hint = _MOSCOW.get(cells[prio_col].strip().lower()) if prio_col is not None else None
        out.append(Candidate(text, block.heading_path, block.page, block.position, ext, hint))
    return out


def mine_requirements(blocks: list[Block]) -> list[Candidate]:
    candidates: list[Candidate] = []
    seen: set[str] = set()
    stem: str | None = None
    stem_section: str | None = None

    def add(c: Candidate) -> None:
        key = c.key
        if key and key not in seen and len(key) >= 12:
            seen.add(key)
            candidates.append(c)

    for block in blocks:
        if block.kind == "heading":
            stem = None
            continue
        if block.kind == "table":
            stem = None
            for c in _table_candidates(block):
                add(c)
            continue

        text, ext = _strip_id(block.text)

        if block.kind == "list" and stem and stem_section == block.heading_path and not ext:
            if not _MODAL_RE.search(text):
                add(Candidate(_join_stem(stem, text), block.heading_path, block.page, block.position))
                continue
        if block.kind != "list":
            stem = None

        if ext:
            # Explicitly identified requirement — keep the whole statement.
            if text.endswith(":"):
                stem, stem_section = text, block.heading_path
            else:
                add(Candidate(text, block.heading_path, block.page, block.position, ext))
            continue

        for sentence in split_sentences(text):
            if sentence.endswith(":") and _MODAL_RE.search(sentence) and not _SELF_REFERENCE.search(sentence):
                stem, stem_section = sentence, block.heading_path
                continue
            if is_requirement_sentence(sentence):
                add(Candidate(sentence, block.heading_path, block.page, block.position))
    return candidates
