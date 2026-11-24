from io import BytesIO

import openpyxl


def _upload(client, project_id, path, title="Banking SRS"):
    with open(path, "rb") as fh:
        return client.post("/api/documents", data={"project_id": project_id, "title": title},
                           files={"file": (path.name, fh, "application/pdf")})


def test_project_crud_and_validation(client):
    assert client.post("/api/projects", json={"name": "x"}).status_code == 422
    r = client.post("/api/projects", json={"name": "  Payments  ", "color": "indigo"})
    assert r.status_code == 201
    p = r.json()
    assert p["name"] == "Payments" and p["stats"]["requirements"] == 0
    r = client.patch(f"/api/projects/{p['id']}", json={"status": "on_hold"})
    assert r.json()["status"] == "on_hold"
    assert client.patch(f"/api/projects/{p['id']}", json={"status": "bogus"}).status_code == 422
    assert client.delete(f"/api/projects/{p['id']}").status_code == 204
    assert client.get(f"/api/projects/{p['id']}").status_code == 404


def test_upload_rejects_invalid_files(client):
    pid = client.post("/api/projects", json={"name": "Upload checks"}).json()["id"]
    r = client.post("/api/documents", data={"project_id": pid}, files={"file": ("a.txt", b"hi", "text/plain")})
    assert r.status_code == 415
    r = client.post("/api/documents", data={"project_id": pid}, files={"file": ("a.pdf", b"not a pdf", "application/pdf")})
    assert r.status_code == 415
    r = client.post("/api/documents", data={"project_id": 9999}, files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")})
    assert r.status_code == 404


def test_end_to_end_workflow(client, samples):
    pid = client.post("/api/projects", json={"name": "Aurora"}).json()["id"]

    # 1. Upload and process v1
    r = _upload(client, pid, samples["aurora_banking_srs_v1.0.pdf"])
    assert r.status_code == 201
    doc = r.json()
    doc_id = doc["id"]
    detail = client.get(f"/api/documents/{doc_id}").json()
    v1 = detail["versions"][0]
    assert v1["status"] == "ready" and v1["progress"] == 100 and v1["analysis_source"] == "demo"
    sections = client.get(f"/api/versions/{v1['id']}/sections").json()
    assert any(s["kind"] == "table" for s in sections) and any(s["is_requirement"] for s in sections)
    assert client.get(f"/api/versions/{v1['id']}/sections", params={"q": "IFSC"}).json()

    # 2. Requirements with IDs and analysis
    reqs = client.get("/api/requirements", params={"project_id": pid}).json()
    assert len(reqs) == 27
    assert [r["code"] for r in reqs[:3]] == ["REQ-001", "REQ-002", "REQ-003"]
    lock = next(r for r in reqs if r["external_id"] == "FR-2")
    assert lock["category"] == "Security" and lock["criteria"] and lock["analysis_source"] == "demo"
    assert client.get("/api/requirements", params={"project_id": pid, "q": "IFSC"}).json()
    assert all(r["category"] == "Security" for r in client.get("/api/requirements", params={"category": "Security"}).json())

    # 3. Edit requirement and criteria
    r = client.patch(f"/api/requirements/{lock['id']}", json={"priority": "Critical", "review_status": "approved"})
    assert r.json()["priority"] == "Critical" and r.json()["edited"] is True
    r = client.put(f"/api/requirements/{lock['id']}/criteria", json={"criteria": ["Given A then B", "Given C then D"]})
    assert [c["code"] for c in r.json()["criteria"]] == [f"AC-{lock['code'][-3:]}.1", f"AC-{lock['code'][-3:]}.2"]
    client.post(f"/api/requirements/{lock['id']}/reanalyze")

    # 4. Generate tests for a few requirements
    ids = [r["id"] for r in reqs[:6]]
    r = client.post("/api/test-cases/generate", json={"requirement_ids": ids, "types": ["positive", "negative"]})
    assert r.status_code == 200
    gen = r.json()
    assert gen["created"] == 12 and gen["source"] == "demo"
    assert gen["test_cases"][0]["code"] == "TC-0001"
    tc = gen["test_cases"][0]
    r = client.patch(f"/api/test-cases/{tc['id']}", json={"title": "Edited title", "status": "ready"})
    assert r.json()["title"] == "Edited title"
    r = client.post(f"/api/test-cases/{tc['id']}/regenerate")
    assert r.json()["code"] == tc["code"] and r.json()["status"] == "draft"
    assert client.post("/api/test-cases/generate", json={"requirement_ids": [999999]}).status_code == 404

    # 5. Traceability
    m = client.get("/api/traceability", params={"project_id": pid}).json()
    assert m["summary"]["requirements"] == 27
    assert m["summary"]["uncovered"] == 21
    assert any(g["type"] == "uncovered" for g in m["gaps"])

    # 6. Upload v2 → change analysis, impacted tests flagged
    with open(samples["aurora_banking_srs_v1.1.pdf"], "rb") as fh:
        r = client.post(f"/api/documents/{doc_id}/versions", files={"file": ("v1.1.pdf", fh, "application/pdf")})
    assert r.status_code == 201
    sets = client.get("/api/changes", params={"document_id": doc_id}).json()
    assert len(sets) == 1
    cs = client.get(f"/api/changes/{sets[0]['id']}").json()
    assert cs["counts"] == {"added": 2, "modified": 6, "removed": 1, "unchanged": 20}
    fr2 = next(c for c in cs["changes"] if c["requirement_code"] == lock["code"])
    assert fr2["change_type"] == "modified" and fr2["diff"] and fr2["severity"] in {"high", "critical"}
    assert cs["impact_summary"]
    flagged = client.get("/api/test-cases", params={"project_id": pid, "status_filter": "needs_review"}).json()
    assert flagged
    removed = client.get("/api/requirements", params={"project_id": pid, "status_filter": "removed"}).json()
    assert len(removed) == 1

    cmp = client.get(f"/api/documents/{doc_id}/compare", params={"from": 1, "to": 2}).json()
    assert cmp["counts"]["modified"] == 6
    assert client.post(f"/api/changes/{cs['id']}/acknowledge").json()["acknowledged"] is True

    # 7. Reports in all formats
    for kind in ("requirements", "test-cases", "changes", "traceability"):
        r = client.get(f"/api/reports/{kind}.csv", params={"project_id": pid})
        assert r.status_code == 200 and r.text.lstrip("﻿").split("\n", 1)[0]
        r = client.get(f"/api/reports/{kind}.xlsx", params={"project_id": pid})
        wb = openpyxl.load_workbook(BytesIO(r.content))
        assert wb.active.max_row > 4
        r = client.get(f"/api/reports/{kind}.pdf", params={"project_id": pid})
        assert r.content.startswith(b"%PDF")

    # 8. Dashboard and search
    d = client.get("/api/dashboard").json()
    assert d["kpis"]["requirements"] == 28 and d["kpis"]["needs_review"] >= 1
    assert d["alerts"] == []  # acknowledged
    s = client.get("/api/search", params={"q": "REQ-00"}).json()
    assert s["requirements"]

    # 9. Bulk delete + document delete
    all_tests = client.get("/api/test-cases", params={"project_id": pid}).json()
    r = client.post("/api/test-cases/bulk-delete", json={"ids": [t["id"] for t in all_tests[:3]]})
    assert r.json()["deleted"] == 3
    assert client.delete(f"/api/documents/{doc_id}").status_code == 204
    assert client.get("/api/requirements", params={"project_id": pid}).json() == []


def test_version_upload_requires_processed_base(client, samples):
    pid = client.post("/api/projects", json={"name": "Fail case"}).json()["id"]
    import pymupdf

    blank = pymupdf.open()
    blank.new_page()
    r = client.post("/api/documents", data={"project_id": pid},
                    files={"file": ("scan.pdf", blank.tobytes(), "application/pdf")})
    doc = client.get(f"/api/documents/{r.json()['id']}").json()
    v = doc["versions"][0]
    assert v["status"] == "failed" and "No extractable text" in v["error"]
    with open(samples["fleetpulse_platform_requirements.pdf"], "rb") as fh:
        r = client.post(f"/api/documents/{doc['id']}/versions", files={"file": ("x.pdf", fh, "application/pdf")})
    assert r.status_code == 409


def test_manual_requirement_and_test_case(client):
    pid = client.post("/api/projects", json={"name": "Manual"}).json()["id"]
    r = client.post("/api/requirements", json={"project_id": pid, "description": "The system shall export audit logs to CSV."})
    assert r.status_code == 201
    req = r.json()
    assert req["code"] == "REQ-001" and req["analysis_source"] == "demo"
    r = client.post("/api/test-cases", json={"requirement_id": req["id"], "title": "Export audit log",
                                             "steps": ["Open audit", "Click export"], "criterion_id": req["criteria"][0]["id"]})
    assert r.status_code == 201 and r.json()["source"] == "manual" and r.json()["criterion_code"]
    r = client.post("/api/test-cases", json={"requirement_id": req["id"], "title": "Bad link", "criterion_id": 99999})
    assert r.status_code == 400
