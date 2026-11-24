import pymupdf
import pytest

from app.services.miner import mine_requirements, split_sentences
from app.services.pdf_extractor import PDFExtractionError, extract_pdf


def test_extracts_structure_from_spec(samples):
    result = extract_pdf(samples["aurora_banking_srs_v1.0.pdf"].read_bytes())
    kinds = {b.kind for b in result.blocks}
    assert {"heading", "paragraph", "list", "table", "statement"} <= kinds
    headings = [b for b in result.blocks if b.kind == "heading"]
    assert any(h.text == "4.1 Transfer Limits and Receipts" and h.level == 2 for h in headings)
    table = next(b for b in result.blocks if b.kind == "table")
    assert table.table[0] == ["ID", "Requirement", "Priority"]
    assert "daily transfer limit" in table.table[1][1]  # word spacing preserved
    assert result.page_count >= 1


def test_heading_paths_are_hierarchical(samples):
    result = extract_pdf(samples["aurora_banking_srs_v1.0.pdf"].read_bytes())
    table = next(b for b in result.blocks if b.kind == "table")
    assert table.heading_path.endswith("4 Payments and Transfers › 4.1 Transfer Limits and Receipts")


def test_rejects_non_pdf():
    with pytest.raises(PDFExtractionError):
        extract_pdf(b"hello world")


def test_rejects_pdf_without_text():
    doc = pymupdf.open()
    doc.new_page()
    with pytest.raises(PDFExtractionError, match="No extractable text"):
        extract_pdf(doc.tobytes())


def test_mines_ids_stems_and_tables(samples):
    result = extract_pdf(samples["aurora_banking_srs_v1.0.pdf"].read_bytes())
    cands = mine_requirements(result.blocks)
    texts = [c.text for c in cands]
    assert len(cands) == 27
    assert any(c.external_id == "FR-2" and "5 consecutive" in c.text for c in cands)
    # list stem "The system shall:" joined with each bullet
    assert "The system shall validate the beneficiary account number and IFSC code before submission." in texts
    # table rows with MoSCoW priority hint
    fr20 = next(c for c in cands if c.external_id == "FR-20")
    assert fr20.priority_hint == "Critical"
    # document self-references are not requirements
    assert not any(t.startswith("This document") for t in texts)


def test_sentence_split_keeps_abbreviations():
    parts = split_sentences("The system shall export data, e.g. CSV files. Users must sign in.")
    assert parts == ["The system shall export data, e.g. CSV files.", "Users must sign in."]
