"""Render datasets to CSV, XLSX and branded PDF."""

from __future__ import annotations

import csv
import io
from datetime import datetime
from xml.sax.saxutils import escape

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.reports.datasets import Dataset

INK = colors.HexColor("#0F172A")
MUTED = colors.HexColor("#64748B")
BRAND = colors.HexColor("#0D9488")
LINE = colors.HexColor("#E2E8F0")
ZEBRA = colors.HexColor("#F8FAFC")


def to_csv(ds: Dataset) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(ds.columns)
    for row in ds.rows:
        writer.writerow(["" if v is None else v for v in row])
    return ("﻿" + buf.getvalue()).encode("utf-8")


def to_xlsx(ds: Dataset) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = ds.title[:31]
    ws.append([ds.title])
    ws["A1"].font = Font(bold=True, size=14, color="0F172A")
    ws.append([f"{ds.subtitle} · generated {datetime.now():%Y-%m-%d %H:%M} by SpecLens"])
    ws["A2"].font = Font(size=10, color="64748B")
    ws.append([])
    header_row = 4
    ws.append(ds.columns)
    fill = PatternFill("solid", fgColor="0D9488")
    for idx in range(1, len(ds.columns) + 1):
        cell = ws.cell(row=header_row, column=idx)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = fill
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    for row in ds.rows:
        ws.append(row)
    for r in ws.iter_rows(min_row=header_row + 1, max_row=ws.max_row):
        for cell in r:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    for idx, col in enumerate(ds.columns, start=1):
        longest = max([len(str(col))] + [min(len(str(r[idx - 1] or "")), 80) for r in ds.rows[:300]])
        ws.column_dimensions[get_column_letter(idx)].width = max(10, min(60, longest * 0.9 + 2))
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    ws.auto_filter.ref = f"A{header_row}:{get_column_letter(len(ds.columns))}{max(ws.max_row, header_row)}"

    summary = wb.create_sheet("Summary")
    summary.append(["Metric", "Value"])
    for c in summary[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = fill
    for k, v in ds.summary:
        summary.append([k, v])
    summary.column_dimensions["A"].width = 28
    summary.column_dimensions["B"].width = 16
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def to_pdf(ds: Dataset) -> bytes:
    buf = io.BytesIO()
    page = landscape(A4)
    doc = SimpleDocTemplate(buf, pagesize=page, leftMargin=14 * mm, rightMargin=14 * mm,
                            topMargin=18 * mm, bottomMargin=14 * mm, title=ds.title, author="SpecLens")
    title = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=20, textColor=INK, leading=24)
    sub = ParagraphStyle("s", fontName="Helvetica", fontSize=10, textColor=MUTED, leading=14)
    cell = ParagraphStyle("c", fontName="Helvetica", fontSize=7.4, textColor=INK, leading=9.4, alignment=TA_LEFT)
    head = ParagraphStyle("h", parent=cell, fontName="Helvetica-Bold", textColor=colors.white)
    kv_label = ParagraphStyle("kl", fontName="Helvetica", fontSize=8, textColor=MUTED, leading=10)
    kv_value = ParagraphStyle("kv", fontName="Helvetica-Bold", fontSize=15, textColor=INK, leading=18)

    story = [
        Paragraph(escape(ds.title), title),
        Spacer(1, 3),
        Paragraph(escape(f"{ds.subtitle} · Generated {datetime.now():%d %b %Y, %H:%M}"), sub),
        Spacer(1, 10),
    ]
    if ds.summary:
        cells = [[Paragraph(escape(v), kv_value), Paragraph(escape(k), kv_label)] for k, v in ds.summary]
        tiles = [[Table([[c[0]], [c[1]]], style=[("LEFTPADDING", (0, 0), (-1, -1), 0)]) for c in cells]]
        kpi = Table(tiles, colWidths=[(page[0] - 28 * mm) / len(cells)] * len(cells))
        kpi.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.6, LINE), ("INNERGRID", (0, 0), (-1, -1), 0.6, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("BACKGROUND", (0, 0), (-1, -1), ZEBRA),
        ]))
        story += [kpi, Spacer(1, 12)]

    widths = ds.widths or [1] * len(ds.columns)
    keep = [i for i, w in enumerate(widths) if w > 0]
    total = sum(widths[i] for i in keep)
    avail = page[0] - 28 * mm
    col_widths = [avail * widths[i] / total for i in keep]

    def fmt(v) -> Paragraph:
        text = escape("" if v is None else str(v)).replace("\n", "<br/>")
        return Paragraph(text, cell)

    data = [[Paragraph(escape(ds.columns[i]), head) for i in keep]]
    data += [[fmt(row[i]) for i in keep] for row in ds.rows]
    if len(data) == 1:
        data.append([Paragraph("No records for this scope.", cell)] + [Paragraph("", cell)] * (len(keep) - 1))
    table = LongTable(data, colWidths=col_widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    for r in range(2, len(data), 2):
        style.append(("BACKGROUND", (0, r), (-1, r), ZEBRA))
    table.setStyle(TableStyle(style))
    story.append(table)

    def decorate(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(BRAND)
        canvas.rect(0, page[1] - 6, page[0], 6, fill=1, stroke=0)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.setFillColor(INK)
        canvas.drawString(14 * mm, page[1] - 12 * mm, "SpecLens")
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(page[0] - 14 * mm, page[1] - 12 * mm, "Requirements intelligence report")
        canvas.drawRightString(page[0] - 14 * mm, 8 * mm, f"Page {_doc.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
    return buf.getvalue()


RENDERERS = {
    "csv": (to_csv, "text/csv; charset=utf-8"),
    "xlsx": (to_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "pdf": (to_pdf, "application/pdf"),
}
