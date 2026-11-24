"""Requirement-level version comparison.

Unlike a positional text diff, requirements are paired by meaning:

1. explicit requirement IDs (``FR-12`` ↔ ``FR-12``),
2. exact normalised text,
3. best text similarity (sequence ratio blended with token overlap, small
   bonus for the same section), greedily from the strongest pair, above a
   threshold.

Each modified pair is then inspected for *semantic signals* — a weakened
obligation verb, a changed number, an added or removed negation — which feed
a severity score (low → critical).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher

from app.services.miner import normalize

MATCH_THRESHOLD = 0.55
SEVERITY_ORDER = ["none", "low", "medium", "high", "critical"]
_MODAL_STRENGTH = {"shall": 3, "must": 3, "is required to": 3, "will": 2, "should": 2, "may": 1, "can": 1}
_MODAL_RE = re.compile(r"\b(shall|must|is required to|will|should|may|can)\b", re.I)
_NUM_RE = re.compile(r"\d+(?:[.,]\d+)?")
_NEG_RE = re.compile(r"\b(not|never|cannot|can't|must not|shall not|prohibit\w*)\b", re.I)


@dataclass
class Item:
    key: str  # opaque identifier (requirement id / candidate index)
    text: str
    external_id: str | None = None
    section: str = ""
    priority: str = "Medium"
    category: str = "Functional"
    tests: int = 0


@dataclass
class Change:
    change_type: str  # added | modified | removed | unchanged
    old: Item | None
    new: Item | None
    similarity: float = 0.0
    severity: str = "none"
    signals: list[str] = field(default_factory=list)


def similarity(a: str, b: str) -> float:
    na, nb = normalize(a), normalize(b)
    if na == nb:
        return 1.0
    seq = SequenceMatcher(None, na.split(), nb.split(), autojunk=False).ratio()
    ta, tb = set(na.split()), set(nb.split())
    jac = len(ta & tb) / len(ta | tb) if ta | tb else 0.0
    return round(0.6 * seq + 0.4 * jac, 4)


def _modal(text: str) -> str | None:
    m = _MODAL_RE.search(text)
    return m.group(1).lower() if m else None


def detect_signals(old: str, new: str) -> list[str]:
    signals: list[str] = []
    mo, mn = _modal(old), _modal(new)
    if mo and mn and mo != mn:
        so, sn = _MODAL_STRENGTH.get(mo, 2), _MODAL_STRENGTH.get(mn, 2)
        if sn < so:
            signals.append(f"Obligation weakened: “{mo}” → “{mn}”")
        elif sn > so:
            signals.append(f"Obligation strengthened: “{mo}” → “{mn}”")
    no, nn = _NUM_RE.findall(old), _NUM_RE.findall(new)
    if no != nn:
        removed = [n for n in no if n not in nn]
        added = [n for n in nn if n not in no]
        if removed and added:
            signals.append(f"Value changed: {', '.join(removed[:3])} → {', '.join(added[:3])}")
        elif added:
            signals.append(f"New value introduced: {', '.join(added[:3])}")
        elif removed:
            signals.append(f"Value removed: {', '.join(removed[:3])}")
    neg_o, neg_n = len(_NEG_RE.findall(old)), len(_NEG_RE.findall(new))
    if neg_o != neg_n:
        signals.append("Negation changed — behaviour may be inverted")
    return signals


def _bump(level: str, steps: int = 1) -> str:
    return SEVERITY_ORDER[min(SEVERITY_ORDER.index(level) + steps, len(SEVERITY_ORDER) - 1)]


def severity_for(change: Change) -> str:
    if change.change_type == "unchanged":
        return "none"
    ref = change.new or change.old
    assert ref is not None
    important = ref.priority in {"High", "Critical"} or ref.category in {"Security", "Compliance"}
    if change.change_type == "added":
        return "high" if ref.priority == "Critical" else "medium" if important else "low"
    if change.change_type == "removed":
        level = "high" if (change.old and change.old.tests) or important else "medium"
        return _bump(level) if ref.priority == "Critical" else level
    # modified
    delta = 1 - change.similarity
    level = "high" if delta > 0.4 else "medium" if delta > 0.12 else "low"
    if any(s.startswith(("Obligation weakened", "Value changed", "Value removed")) for s in change.signals):
        level = max(level, "high", key=SEVERITY_ORDER.index)
    if any(s.startswith("Negation") for s in change.signals):
        level = "critical"
    if important and level in {"low", "medium"}:
        level = _bump(level)
    return level


def compare(old_items: list[Item], new_items: list[Item]) -> list[Change]:
    """Pair old and new requirements and classify every change."""
    pairs: list[tuple[Item, Item, float]] = []
    old_left = list(old_items)
    new_left = list(new_items)

    # 1) explicit IDs
    by_ext = {o.external_id: o for o in old_left if o.external_id}
    for n in list(new_left):
        o = by_ext.get(n.external_id) if n.external_id else None
        if o is not None and o in old_left:
            pairs.append((o, n, similarity(o.text, n.text)))
            old_left.remove(o)
            new_left.remove(n)

    # 2) exact normalised text
    by_norm: dict[str, list[Item]] = {}
    for o in old_left:
        by_norm.setdefault(normalize(o.text), []).append(o)
    for n in list(new_left):
        bucket = by_norm.get(normalize(n.text))
        if bucket:
            o = bucket.pop(0)
            pairs.append((o, n, 1.0))
            old_left.remove(o)
            new_left.remove(n)

    # 3) greedy best similarity
    scored: list[tuple[float, int, int]] = []
    for i, o in enumerate(old_left):
        for j, n in enumerate(new_left):
            s = similarity(o.text, n.text)
            if o.section and o.section == n.section:
                s += 0.05
            if s >= MATCH_THRESHOLD:
                scored.append((s, i, j))
    scored.sort(reverse=True)
    used_o: set[int] = set()
    used_n: set[int] = set()
    for _s, i, j in scored:
        if i in used_o or j in used_n:
            continue
        used_o.add(i)
        used_n.add(j)
        pairs.append((old_left[i], new_left[j], similarity(old_left[i].text, new_left[j].text)))

    changes: list[Change] = []
    for o, n, s in pairs:
        if normalize(o.text) == normalize(n.text):
            changes.append(Change("unchanged", o, n, 1.0))
        else:
            changes.append(Change("modified", o, n, s, signals=detect_signals(o.text, n.text)))
    changes += [Change("added", None, new_left[j]) for j in range(len(new_left)) if j not in used_n]
    changes += [Change("removed", old_left[i], None) for i in range(len(old_left)) if i not in used_o]

    for c in changes:
        c.severity = severity_for(c)

    order = {id(n): k for k, n in enumerate(new_items)}
    old_order = {id(o): k for k, o in enumerate(old_items)}
    changes.sort(key=lambda c: (order.get(id(c.new), 10**6), old_order.get(id(c.old), 10**6)))
    return changes


def word_diff(old: str, new: str) -> list[dict]:
    """Word-level diff ops for side-by-side highlighting."""
    a, b = old.split(), new.split()
    ops: list[dict] = []
    for tag, i1, i2, j1, j2 in SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            ops.append({"op": "equal", "text": " ".join(a[i1:i2])})
        else:
            if i2 > i1:
                ops.append({"op": "delete", "text": " ".join(a[i1:i2])})
            if j2 > j1:
                ops.append({"op": "insert", "text": " ".join(b[j1:j2])})
    return ops
