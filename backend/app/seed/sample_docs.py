"""Generates realistic sample specification PDFs used for demo data and manual testing."""

from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# Content model: list of (heading, level, items); item = (kind, payload)
Spec = list[tuple[str, int, list[tuple[str, object]]]]

BANKING_V1: Spec = [
    ("1 Introduction", 1, [
        ("p", "This document specifies the functional and non-functional requirements for the Aurora Retail "
              "Banking Portal, the web channel through which retail customers service accounts and make payments."),
        ("p", "The release covers account servicing, payments, notifications and customer self-service."),
        ("note", "Note: Card management features are out of scope for release 1."),
    ]),
    ("2 User Accounts and Authentication", 1, [
        ("p", "FR-1 The system shall allow customers to register using their customer ID, registered mobile number "
              "and a one-time password."),
        ("p", "FR-2 The system shall lock a customer account after 5 consecutive failed login attempts within 15 minutes."),
        ("p", "FR-3 Passwords must contain at least 10 characters including one uppercase letter, one digit and one "
              "special character."),
        ("p", "FR-4 The system shall require two-factor authentication for every login from a new device."),
        ("p", "FR-5 User sessions shall expire after 10 minutes of inactivity."),
        ("p", "FR-6 Customers should be able to reset their password using a fast and user-friendly self-service flow."),
    ]),
    ("3 Accounts and Statements", 1, [
        ("p", "Customers shall be able to view balances for all linked savings, current and deposit accounts on a "
              "single dashboard. The system shall display the last 90 days of transactions with filters by date, "
              "amount and transaction type."),
        ("p", "Customers shall be able to download monthly statements in PDF and CSV format."),
        ("p", "The system should support various statement languages as needed."),
    ]),
    ("4 Payments and Transfers", 1, [
        ("bullets", ("The system shall:", [
            "Support fund transfers between the customer's own accounts in real time",
            "Allow transfers to registered beneficiaries via NEFT, RTGS and IMPS",
            "Validate the beneficiary account number and IFSC code before submission",
        ])),
        ("p", "A newly added beneficiary must not receive transfers above 25,000 INR within the first 24 hours."),
        ("p", "The system shall send an SMS and email notification for every debit transaction above 1,000 INR."),
        ("p", "Scheduled payments shall be executed on the scheduled date and retried once if the first attempt fails."),
        ("h", ("4.1 Transfer Limits and Receipts", 2)),
        ("table", [
            ["ID", "Requirement", "Priority"],
            ["FR-20", "The system shall allow customers to set a daily transfer limit between 10,000 and 500,000 INR.", "Must"],
            ["FR-21", "The system shall provide a downloadable payment receipt for every successful transfer.", "Should"],
            ["FR-22", "Customers could save frequently used payments as reusable templates.", "Could"],
        ]),
    ]),
    ("5 Non-Functional Requirements", 1, [
        ("p", "NFR-1 The dashboard page shall load within 2 seconds for 95% of requests under a load of 2,000 "
              "concurrent users."),
        ("p", "NFR-2 The portal shall maintain 99.9% availability measured monthly, excluding planned maintenance."),
        ("p", "NFR-3 All data in transit shall be encrypted using TLS 1.2 or higher."),
        ("p", "NFR-4 The system shall retain audit logs of all financial transactions for 8 years in line with RBI "
              "regulatory guidelines."),
        ("p", "NFR-5 The user interface shall comply with WCAG 2.1 level AA accessibility guidelines."),
        ("p", "NFR-6 The system shall integrate with the core banking system through its REST API with a timeout of 5 seconds."),
        ("note", "Assumption: The core banking API is available 24x7 except during the nightly batch window."),
    ]),
    ("6 Reporting", 1, [
        ("p", "Administrators shall be able to generate a daily report of failed transactions."),
        ("p", "The analytics dashboard should be robust and efficient."),
    ]),
]


def _banking_v2() -> Spec:
    import copy

    spec = copy.deepcopy(BANKING_V1)
    sec = {h: items for h, _, items in spec}
    auth = sec["2 User Accounts and Authentication"]
    auth[1] = ("p", "FR-2 The system shall lock a customer account after 3 consecutive failed login attempts within 15 minutes.")
    auth[4] = ("p", "FR-5 User sessions shall expire after 5 minutes of inactivity.")
    auth[5] = ("p", "FR-6 Customers shall be able to reset their password through a self-service flow that completes "
                    "in no more than 4 steps.")
    accounts = sec["3 Accounts and Statements"]
    del accounts[2]  # remove ambiguous language requirement
    accounts.append(("p", "The system shall allow customers to temporarily block their debit card from the dashboard."))
    pay = sec["4 Payments and Transfers"]
    pay[1] = ("p", "A newly added beneficiary must not receive transfers above 50,000 INR within the first 24 hours.")
    pay[5] = ("table", [
        ["ID", "Requirement", "Priority"],
        ["FR-20", "The system shall allow customers to set a daily transfer limit between 10,000 and 500,000 INR.", "Must"],
        ["FR-21", "The system shall provide a downloadable and emailable payment receipt for every successful transfer.", "Should"],
        ["FR-22", "Customers could save frequently used payments as reusable templates.", "Could"],
    ])
    nfr = sec["5 Non-Functional Requirements"]
    nfr[0] = ("p", "NFR-1 The dashboard page shall load within 1.5 seconds for 95% of requests under a load of 2,000 "
                   "concurrent users.")
    nfr.insert(6, ("p", "NFR-7 The portal shall support the latest two versions of Chrome, Safari and Edge."))
    intro = sec["1 Introduction"]
    intro[2] = ("note", "Note: Debit card blocking is included in release 1.1; other card features remain out of scope.")
    return spec


FLEET_V1: Spec = [
    ("1 Overview", 1, [
        ("p", "FleetPulse is a telematics platform that gives logistics operators live visibility of vehicles, "
              "drivers and maintenance across their fleet."),
    ]),
    ("2 Vehicle Tracking", 1, [
        ("p", "FR-01 The platform shall record each vehicle's GPS position every 30 seconds while the ignition is on."),
        ("p", "FR-02 Dispatchers shall be able to view all active vehicles on a live map with status colour coding."),
        ("p", "FR-03 The system shall raise a geofence alert within 60 seconds when a vehicle exits an assigned zone."),
        ("p", "FR-04 Telematics devices must buffer location data for up to 72 hours when connectivity is lost and "
              "upload it once reconnected."),
    ]),
    ("3 Driver Behaviour", 1, [
        ("bullets", ("The system shall:", [
            "Detect harsh braking, harsh acceleration and over-speeding events",
            "Calculate a weekly safety score from 0 to 100 for each driver",
            "Notify fleet managers by email when a driver's score drops below 60",
        ])),
        ("p", "Drivers should be able to see their own score in the mobile app in a simple and intuitive way."),
    ]),
    ("4 Maintenance", 1, [
        ("p", "FR-10 The system shall create a maintenance reminder 7 days before a vehicle's service due date or "
              "odometer threshold."),
        ("p", "FR-11 Workshop managers shall be able to record completed services, parts used and labour cost."),
        ("table", [
            ["Req ID", "Description", "Priority"],
            ["FR-12", "The system shall generate a monthly fuel consumption report per vehicle and per route.", "High"],
            ["FR-13", "The platform shall export maintenance history to CSV for any selected date range.", "Medium"],
        ]),
    ]),
    ("5 Integration and Security", 1, [
        ("p", "NFR-01 The platform shall expose a REST API for ERP integration secured with OAuth 2.0 client credentials."),
        ("p", "NFR-02 The system shall enforce role-based access control for administrator, dispatcher, workshop and "
              "driver roles."),
        ("p", "NFR-03 Location history shall be retained for 2 years and then anonymised."),
        ("p", "NFR-04 The live map shall refresh vehicle positions within 5 seconds of receipt for up to 5,000 vehicles."),
        ("note", "Constraint: Devices in the pilot use the TL-200 firmware, which supports MQTT only."),
    ]),
]

PATIENT_V1: Spec = [
    ("1 Purpose", 1, [
        ("p", "MediTrack Patient Portal lets patients book appointments, view results and communicate with their care team."),
    ]),
    ("2 Appointments", 1, [
        ("p", "REQ-1 Patients shall be able to book, reschedule and cancel appointments up to 24 hours before the slot."),
        ("p", "REQ-2 The system shall send an appointment reminder by SMS 48 hours and 2 hours before the appointment."),
        ("p", "REQ-3 The portal should show available slots quickly."),
    ]),
    ("3 Records and Privacy", 1, [
        ("p", "REQ-4 Patients shall be able to view laboratory results only after they are released by a clinician."),
        ("p", "REQ-5 The system must log every access to a patient record including user, timestamp and purpose."),
        ("p", "REQ-6 All patient data at rest shall be encrypted using AES-256."),
        ("p", "REQ-7 The system shall obtain explicit patient consent before sharing records with third-party providers."),
    ]),
    ("4 Messaging", 1, [
        ("p", "REQ-8 Patients shall be able to send secure messages to their care team with attachments up to 10 MB."),
        ("p", "REQ-9 Care teams should respond to messages within an appropriate time frame."),
    ]),
]


def build_pdf(path: Path, title: str, subtitle: str, spec: Spec) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=22 * mm, rightMargin=22 * mm,
                            topMargin=22 * mm, bottomMargin=20 * mm, title=title)
    t = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=22, leading=27, spaceAfter=4)
    st = ParagraphStyle("sub", fontName="Helvetica", fontSize=11, leading=15, textColor=colors.HexColor("#475569"),
                        spaceAfter=18)
    h1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=15, leading=19, spaceBefore=14, spaceAfter=6)
    h2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=10.5, leading=14.5, spaceAfter=7)
    note = ParagraphStyle("note", parent=body, fontName="Helvetica-Oblique", textColor=colors.HexColor("#334155"))
    cell = ParagraphStyle("cell", fontName="Helvetica", fontSize=9.5, leading=12.5)

    story = [Paragraph(escape(title), t), Paragraph(escape(subtitle), st)]
    for heading, level, items in spec:
        story.append(Paragraph(escape(heading), h1 if level == 1 else h2))
        for kind, payload in items:
            if kind == "p":
                story.append(Paragraph(escape(str(payload)), body))
            elif kind == "note":
                story.append(Paragraph(escape(str(payload)), note))
            elif kind == "h":
                text, lvl = payload  # type: ignore[misc]
                story.append(Paragraph(escape(text), h1 if lvl == 1 else h2))
            elif kind == "bullets":
                stem, bullets = payload  # type: ignore[misc]
                story.append(Paragraph(escape(stem), body))
                story.append(ListFlowable(
                    [ListItem(Paragraph(escape(b), body), leftIndent=12) for b in bullets],
                    bulletType="bullet", start="•", leftIndent=14,
                ))
                story.append(Spacer(1, 4))
            elif kind == "table":
                rows = payload  # type: ignore[assignment]
                data = [[Paragraph(escape(c), cell) for c in row] for row in rows]  # type: ignore[union-attr]
                tbl = Table(data, colWidths=[22 * mm, 118 * mm, 24 * mm])
                tbl.setStyle(TableStyle([
                    ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#94A3B8")),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]))
                story += [tbl, Spacer(1, 8)]
    doc.build(story)
    return path


SAMPLES = {
    "aurora_banking_srs_v1.0.pdf": ("Aurora Retail Banking Portal — SRS", "Version 1.0 · Approved baseline", BANKING_V1),
    "aurora_banking_srs_v1.1.pdf": ("Aurora Retail Banking Portal — SRS", "Version 1.1 · Change request CR-114", None),
    "fleetpulse_platform_requirements.pdf": ("FleetPulse Platform Requirements", "Version 1.0 · Draft for review", FLEET_V1),
    "meditrack_patient_portal_spec.pdf": ("MediTrack Patient Portal — Functional Specification", "Version 0.9", PATIENT_V1),
}


def ensure_samples(folder: Path) -> dict[str, Path]:
    out: dict[str, Path] = {}
    for name, (title, subtitle, spec) in SAMPLES.items():
        path = folder / name
        if not path.exists():
            build_pdf(path, title, subtitle, spec if spec is not None else _banking_v2())
        out[name] = path
    return out
