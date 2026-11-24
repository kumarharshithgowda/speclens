from app.services.comparator import Item, compare, detect_signals, similarity, word_diff


def _items(texts, ids=None):
    return [Item(str(i), t, (ids or [None] * len(texts))[i]) for i, t in enumerate(texts)]


def test_classifies_added_modified_removed_unchanged():
    old = _items([
        "The system shall lock the account after 5 failed attempts.",
        "Users shall be able to download statements in PDF format.",
        "The system should support various languages as needed.",
    ])
    new = _items([
        "The system shall lock the account after 3 failed attempts.",
        "Users shall be able to download statements in PDF format.",
        "The system shall allow customers to block their debit card.",
    ])
    changes = {c.change_type: c for c in compare(old, new)}
    assert set(changes) == {"modified", "unchanged", "added", "removed"}
    mod = changes["modified"]
    assert "Value changed: 5 → 3" in mod.signals
    assert mod.severity in {"high", "critical"}
    assert changes["unchanged"].severity == "none"


def test_insertion_does_not_shift_matches():
    # A positional diff would mark everything after the insertion as modified.
    base = [f"The system shall support feature number {w} for all users." for w in ("alpha", "beta", "gamma", "delta")]
    new = [base[0], "The system shall provide an entirely new audit export capability.", *base[1:]]
    changes = compare(_items(base), _items(new))
    kinds = [c.change_type for c in changes]
    assert kinds.count("unchanged") == 4 and kinds.count("added") == 1


def test_explicit_ids_anchor_matches():
    old = _items(["FR-9 Reports shall be emailed daily."], ["FR-9"])
    new = _items(["Weekly digest reports shall be published to the portal."], ["FR-9"])
    [c] = compare(old, new)
    assert c.change_type == "modified"


def test_signals_detect_weakened_obligation_and_negation():
    s = detect_signals("The system shall encrypt backups.", "The system may encrypt backups.")
    assert any(x.startswith("Obligation weakened") for x in s)
    s = detect_signals("Admins shall delete records.", "Admins shall not delete records.")
    assert any(x.startswith("Negation") for x in s)
    [c] = compare(_items(["Admins shall delete inactive user records."]), _items(["Admins shall not delete inactive user records."]))
    assert c.severity == "critical"


def test_similarity_and_word_diff():
    assert similarity("A b c", "a  B c") == 1.0
    ops = word_diff("lock after 5 attempts", "lock after 3 attempts")
    assert {"op": "delete", "text": "5"} in ops and {"op": "insert", "text": "3"} in ops
