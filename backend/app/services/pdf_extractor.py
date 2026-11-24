"""PDF structure extraction with PyMuPDF.

Turns a PDF into an ordered list of typed blocks — headings (with levels),
paragraphs, list items, tables and "important statements" (notes,
constraints, assumptions) — each tagged with page number and heading path.

Heuristics
----------
* Body font size = character-weighted mode across the document.
* A line is a heading when it is short, does not read like a sentence and is
  either numbered (``3.2 Login``), noticeably larger than body text, or
  entirely bold.  Level comes from numbering depth, otherwise font-size rank.
* Running headers / footers (text repeated in page margins, page numbers)
  are dropped.
* Tables are detected with ``Page.find_tables`` and the text inside table
  areas is excluded from paragraph flow to avoid duplication.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field

import pymupdf


class PDFExtractionError(Exception):
    """Raised when a PDF cannot be processed (corrupt, encrypted, image-only…)."""


@dataclass
class Block:
    kind: str  # heading | paragraph | list | table | statement
    text: str
    page: int
    level: int = 0
    heading_path: str = ""
    table: list[list[str]] | None = None
    position: int = 0


@dataclass
class ExtractionResult:
    blocks: list[Block]
    page_count: int
    stats: dict = field(default_factory=dict)


_NUMBERED_HEADING = re.compile(r"^(\d+(?:\.\d+){0,5})\.?\s+([A-Z][^\n]{1,110})$")
_BULLET = re.compile(r"^\s*(?:[•●▪◦‣⁃∙•▪◦‣\-–*]|\(?[a-zA-Z0-9]{1,3}[.)])\s+")
_BULLET_ONLY = re.compile(r"^\s*(?:[\u2022\u25cf\u25aa\u25e6\u2023\u2043\u2219\u25a0\-–*]|\(?[a-zA-Z0-9]{1,3}[.)])\s*$")
_PAGE_NUMBER = re.compile(r"^(?:page\s*)?\d+(?:\s*(?:of|/)\s*\d+)?$", re.I)
_STATEMENT = re.compile(
    r"^(note|important|warning|caution|assumption|constraint|dependency|limitation|out of scope)\b\s*[:\-–]",
    re.I,
)
_REQ_ID_START = re.compile(r"^\[?(?:REQ|FR|NFR|SR|UR|BR|SYS|SEC|PERF)[-_ ]?\d", re.I)


@dataclass
class _Line:
    text: str
    size: float
    bold: bool
    page: int
    y0: float
    y1: float
    block_no: int


def _span_is_bold(span: dict) -> bool:
    return bool(span.get("flags", 0) & 16) or "bold" in span.get("font", "").lower()


def _clean(text: str) -> str:
    text = text.replace("­", "").replace("ﬁ", "fi").replace("ﬂ", "fl")
    return re.sub(r"\s+", " ", text).strip()


def _inside(bbox: tuple, areas: list[tuple]) -> bool:
    x0, y0, x1, y1 = bbox
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return any(a[0] - 2 <= cx <= a[2] + 2 and a[1] - 2 <= cy <= a[3] + 2 for a in areas)


def _extract_tables(page: pymupdf.Page) -> list[tuple[tuple, list[list[str]]]]:
    found: list[tuple[tuple, list[list[str]]]] = []
    try:
        tables = page.find_tables()
    except Exception:  # pragma: no cover - table finder is best effort
        return found
    for tab in tables.tables:
        try:
            # Read each cell through its clip box: keeps word spacing intact.
            cleaned = [
                [_clean(page.get_textbox(pymupdf.Rect(cell))) if cell else "" for cell in row.cells]
                for row in tab.rows
            ]
        except Exception:  # pragma: no cover
            continue
        cleaned = [r for r in cleaned if any(r)]
        if len(cleaned) >= 2 and max(len(r) for r in cleaned) >= 2:
            found.append((tuple(tab.bbox), cleaned))
    return found


def extract_pdf(data: bytes) -> ExtractionResult:
    """Parse PDF bytes into structured blocks."""
    if not data or not data.lstrip().startswith(b"%PDF"):
        raise PDFExtractionError("The file is not a valid PDF document.")
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise PDFExtractionError(f"Unable to open PDF: {exc}") from exc

    with doc:
        if doc.needs_pass:
            raise PDFExtractionError("The PDF is password-protected. Remove the password and retry.")
        if doc.page_count == 0:
            raise PDFExtractionError("The PDF has no pages.")

        lines: list[_Line] = []
        tables: list[tuple[int, float, list[list[str]]]] = []  # page, y0, rows
        margin_texts: Counter[str] = Counter()
        page_heights: dict[int, float] = {}

        for pno in range(doc.page_count):
            page = doc[pno]
            page_num = pno + 1
            height = page.rect.height
            page_heights[page_num] = height
            page_tables = _extract_tables(page)
            areas = [bbox for bbox, _ in page_tables]
            for bbox, rows in page_tables:
                tables.append((page_num, bbox[1], rows))

            content = page.get_text("dict", sort=True)
            for bno, block in enumerate(content.get("blocks", [])):
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    spans = [s for s in line.get("spans", []) if s.get("text", "").strip()]
                    if not spans:
                        continue
                    text = _clean("".join(s["text"] for s in line["spans"]))
                    if not text:
                        continue
                    bbox = tuple(line["bbox"])
                    if areas and _inside(bbox, areas):
                        continue
                    size = round(max(s["size"] for s in spans), 1)
                    bold = all(_span_is_bold(s) for s in spans)
                    ln = _Line(text, size, bold, page_num, bbox[1], bbox[3], bno)
                    lines.append(ln)
                    if bbox[1] < height * 0.07 or bbox[3] > height * 0.93:
                        margin_texts[re.sub(r"\d+", "#", text.lower())] += 1

        if not lines and not tables:
            raise PDFExtractionError(
                "No extractable text was found. The PDF may be scanned images; run OCR first."
            )

        # Drop running headers/footers.
        def is_margin_noise(ln: _Line) -> bool:
            h = page_heights[ln.page]
            if not (ln.y0 < h * 0.07 or ln.y1 > h * 0.93):
                return False
            if _PAGE_NUMBER.match(ln.text):
                return True
            return doc.page_count > 1 and margin_texts[re.sub(r"\d+", "#", ln.text.lower())] > 1

        lines = [ln for ln in lines if not is_margin_noise(ln)]

    body_counter: Counter[float] = Counter()
    for ln in lines:
        body_counter[ln.size] += len(ln.text)
    body_size = body_counter.most_common(1)[0][0] if body_counter else 11.0
    larger_sizes = sorted({ln.size for ln in lines if ln.size >= body_size * 1.15}, reverse=True)

    def heading_level(ln: _Line) -> int | None:
        text = ln.text
        if len(text) > 120 or _BULLET.match(text) or _REQ_ID_START.match(text):
            return None
        if text.endswith((".", ",", ";")) and not _NUMBERED_HEADING.match(text):
            return None
        words = text.split()
        m = _NUMBERED_HEADING.match(text)
        if m and len(words) <= 14 and not re.search(r"\b(shall|must|should)\b", text, re.I):
            if ln.size >= body_size * 1.05 or ln.bold:
                return min(m.group(1).count(".") + 1, 6)
        if ln.size >= body_size * 1.15 and len(words) <= 16:
            return min(larger_sizes.index(ln.size) + 1, 6) if ln.size in larger_sizes else 1
        if ln.bold and len(words) <= 10 and not text.endswith(":") and text[:1].isupper():
            return min(len(larger_sizes) + 1, 6)
        return None

    # Group lines into logical blocks.
    raw: list[tuple[int, float, Block]] = []  # (page, y, block)
    current: Block | None = None
    current_key: tuple | None = None
    last_y1 = 0.0

    def flush() -> None:
        nonlocal current
        if current and current.text:
            if current.kind == "paragraph" and _STATEMENT.match(current.text):
                current.kind = "statement"
            raw.append((current.page, current_y, current))
        current = None

    current_y = 0.0
    pending_bullet = False
    for ln in lines:
        if _BULLET_ONLY.match(ln.text):
            pending_bullet = True  # bullet glyph rendered as its own text run
            continue
        lvl = heading_level(ln) if not pending_bullet else None
        if lvl is not None:
            flush()
            raw.append((ln.page, ln.y0, Block("heading", ln.text, ln.page, level=lvl)))
            current_key = None
            last_y1 = ln.y1
            continue
        is_bullet = pending_bullet or bool(_BULLET.match(ln.text)) or bool(_REQ_ID_START.match(ln.text))
        pending_bullet = False
        gap = ln.y0 - last_y1
        same_flow = (
            current is not None
            and current_key is not None
            and current.page == ln.page
            and (
                (current_key == (ln.page, ln.block_no) and gap < ln.size * 1.0)
                or 0 <= gap < ln.size * 0.45
            )
        )
        if is_bullet or not same_flow:
            flush()
            kind = "list" if is_bullet else "paragraph"
            text = _BULLET.sub("", ln.text, count=1) if (is_bullet and not _REQ_ID_START.match(ln.text)) else ln.text
            current = Block(kind, text, ln.page)
            current_y = ln.y0
        else:
            assert current is not None
            if current.text.endswith("-") and not current.text.endswith(" -"):
                current.text = current.text[:-1] + ln.text
            else:
                current.text = f"{current.text} {ln.text}"
        current_key = (ln.page, ln.block_no)
        last_y1 = ln.y1
    flush()

    for page, y0, rows in tables:
        raw.append((page, y0, Block("table", " | ".join(rows[0]), page, table=rows)))

    raw.sort(key=lambda item: (item[0], item[1]))

    # Assign heading paths and positions.
    stack: list[tuple[int, str]] = []
    blocks: list[Block] = []
    for pos, (_, _, blk) in enumerate(raw):
        if blk.kind == "heading":
            while stack and stack[-1][0] >= blk.level:
                stack.pop()
            stack.append((blk.level, blk.text))
        blk.heading_path = " › ".join(t for _, t in stack)
        blk.position = pos
        blocks.append(blk)

    kinds = Counter(b.kind for b in blocks)
    stats = {
        "headings": kinds.get("heading", 0),
        "paragraphs": kinds.get("paragraph", 0),
        "lists": kinds.get("list", 0),
        "tables": kinds.get("table", 0),
        "statements": kinds.get("statement", 0),
        "words": sum(len(b.text.split()) for b in blocks if b.kind != "table"),
        "body_font_size": body_size,
    }
    return ExtractionResult(blocks=blocks, page_count=len(page_heights), stats=stats)
