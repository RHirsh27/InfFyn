"""Render a two-page synthetic executive example from exported InfFyn facts.

This standalone handoff renderer does not certify the application's browser print
path. It reads CLI-supplied exported facts and never contacts a provider or database.
"""

import argparse
import json
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

GREEN = HexColor("#123c35")
INK = HexColor("#213631")
MUTED = HexColor("#596860")
PAPER = HexColor("#f5f4ef")
LINE = HexColor("#dce3dc")
RED = HexColor("#a23431")
AMBER = HexColor("#9b6021")
PAGE_W, PAGE_H, LEFT, WIDTH = 612, 792, 40, 532


def dec(value):
    return Decimal(str(value))


def dollars(value, places=0):
    if value is None:
        return "N/A"
    value = dec(value)
    number = f"${abs(value):,.{places}f}"
    return f"({number})" if value < 0 else number


def pct(value):
    return f"{dec(value):+.1f}%" if value is not None else "N/A"


def paragraph(c, text, x, y, width, size=10, color=INK, bold=False, leading=None):
    style = ParagraphStyle(
        "body", fontName="UI-Bold" if bold else "UI", fontSize=size,
        leading=leading or size * 1.36, textColor=color, alignment=TA_LEFT,
    )
    p = Paragraph(text, style)
    _, height = p.wrap(width, PAGE_H)
    p.drawOn(c, x, y - height)
    return y - height


def line(c, y):
    c.setStrokeColor(LINE)
    c.setLineWidth(.7)
    c.line(LEFT, y, LEFT + WIDTH, y)


def footer(c, page, fingerprint):
    line(c, 45)
    c.setFont("UI", 8)
    c.setFillColor(MUTED)
    c.drawString(LEFT, 29, "INFFYN  /  SYNTHETIC EXECUTIVE EXAMPLE")
    c.drawRightString(LEFT + WIDTH, 29, f"{fingerprint[:8]}  |  {page} / 2")


def synthetic_banner(c, y):
    c.setFillColor(HexColor("#fbefd9"))
    c.roundRect(LEFT, y - 28, WIDTH, 28, 5, fill=1, stroke=0)
    paragraph(c, "<b>SYNTHETIC COMPANY &amp; EVIDENCE</b>  -  Real engine calculations. No provider connected.", LEFT + 12, y - 7, WIDTH - 24, 8.8, AMBER)


def card(c, x, y, width, label, value, note):
    c.setFillColor(white)
    c.setStrokeColor(LINE)
    c.roundRect(x, y - 93, width, 93, 6, fill=1, stroke=1)
    paragraph(c, label.upper(), x + 12, y - 11, width - 24, 8, MUTED, True)
    paragraph(c, value, x + 12, y - 29, width - 24, 23, GREEN, True)
    paragraph(c, note, x + 12, y - 63, width - 24, 8.3, MUTED)


def finding(c, y, number, title, body, color=GREEN):
    c.setFillColor(color)
    c.roundRect(LEFT, y - 27, 23, 23, 4, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("UI-Bold", 10)
    c.drawCentredString(LEFT + 11.5, y - 19, str(number))
    paragraph(c, title, LEFT + 36, y - 2, WIDTH - 36, 11.1, color, True)
    paragraph(c, body, LEFT + 36, y - 22, WIDTH - 36, 9.5, INK, leading=12.8)


def render(report, bundle, output, source_url):
    result = report["result"]
    if result.get("synthetic") is not True or bundle.get("synthetic") is not True:
        raise ValueError("This example renderer accepts explicitly synthetic report exports only.")
    month = result["month"]
    history = sorted((m for m in bundle["performance"] if m["report"]["month"] <= month), key=lambda m: m["report"]["month"])
    current = next(m for m in history if m["report"]["month"] == month)
    if current["report"]["fingerprint"] != report["fingerprint"]:
        raise ValueError("Report export and hosted comparison facts have different fingerprints.")
    if not current["comparison"]["eligible"] or len(history) < 2:
        raise ValueError("The executive example requires an eligible preceding-month comparison.")
    company = bundle["company"]["name"]
    label = datetime.strptime(month, "%Y-%m").strftime("%B %Y")
    first_label = datetime.strptime(history[0]["report"]["month"], "%Y-%m").strftime("%B")
    prior_label = datetime.strptime(history[-2]["report"]["month"], "%Y-%m").strftime("%B")
    rows = result["workloads"]
    products = [w for w in rows if w["kind"] == "product"]
    internal = [w for w in rows if w["kind"] == "internal" and not w["workload"].get("unallocated")]
    drag = min(products, key=lambda w: dec(w["summary"]["contribution"]))
    comparisons = {w["id"]: w for w in current["comparison"]["workloads"]}
    efficient = min(internal, key=lambda w: dec(comparisons[w["workload"]["id"]]["unit_cost"]["percent"]))
    efficient_delta = comparisons[efficient["workload"]["id"]]
    drag_delta = comparisons[drag["workload"]["id"]]
    control = next(w for w in rows if w.get("control_variance") and dec(w["control_variance"]) != 0)
    product_contribution = sum((dec(w["summary"]["contribution"]) for w in products), Decimal(0))
    total = dec(result["summary"]["known_cost"])
    unallocated = dec(result["summary"]["unallocated_cost"])
    fingerprint = report["fingerprint"]
    output.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(output), pagesize=(PAGE_W, PAGE_H))
    c.setTitle(f"InfFyn | {company} | {label} | Synthetic executive example")
    c.setAuthor("InfFyn")
    c.setSubject("Standalone executive handoff rendered from the exported monthly calculation facts")

    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(GREEN)
    c.rect(0, 689, PAGE_W, 103, fill=1, stroke=0)
    paragraph(c, "INFFYN  /  MONTHLY ECONOMICS", LEFT, 763, WIDTH, 9, HexColor("#c6ded2"), True)
    paragraph(c, "AI economics, explained.", LEFT, 739, WIDTH, 27, white, True)
    paragraph(c, escape(company) + "  |  " + label, LEFT, 707, WIDTH, 10, white)
    synthetic_banner(c, 674)
    card_w = (WIDTH - 20) / 3
    card(c, LEFT, 628, card_w, "Included spend", dollars(total), f"{pct(current['comparison']['spend']['percent'])} versus prior month")
    card(c, LEFT + card_w + 10, 628, card_w, "Product contribution", dollars(product_contribution), "Modeled collections less product costs")
    card(c, LEFT + (card_w + 10) * 2, 628, card_w, "Awaiting assignment", dollars(unallocated), f"{unallocated / total * 100:.1f}% of included company spend")

    paragraph(c, "Spending is growing. The reason matters.", LEFT, 514, WIDTH, 13, GREEN, True)
    paragraph(c, f"Included spend rose from {dollars(history[0]['report']['result']['summary']['known_cost'])} in {first_label} to {dollars(total)} in {label.split()[0]}.", LEFT, 493, WIDTH, 9.7, MUTED)
    baseline, height = 377, 77
    peak = max(dec(m["report"]["result"]["summary"]["known_cost"]) for m in history)
    step = WIDTH / len(history)
    for i, item in enumerate(history):
        value = dec(item["report"]["result"]["summary"]["known_cost"])
        bar_h = float(value / peak) * height
        x = LEFT + i * step + 7
        c.setFillColor(GREEN if item["report"]["month"] == month else HexColor("#adc6b7"))
        c.roundRect(x, baseline, step - 19, bar_h, 3, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("UI-Bold", 9)
        c.drawCentredString(x + (step - 19) / 2, baseline + bar_h + 7, dollars(value))
        c.setFont("UI", 9)
        c.setFillColor(MUTED)
        c.drawCentredString(x + (step - 19) / 2, baseline - 15, datetime.strptime(item["report"]["month"], "%Y-%m").strftime("%b"))
    line(c, 346)
    paragraph(c, "Three decisions for the next review", LEFT, 328, WIDTH, 13, GREEN, True)
    finding(c, 302, 1, f"Investigate {escape(drag['workload']['name'])}", f"{dollars(drag['summary']['known_cost'])} of cost against {dollars(drag['summary']['revenue'])} of associated collections leaves {dollars(drag['summary']['contribution'])} contribution. Unit cost changed {pct(drag_delta['unit_cost']['percent'])} from {prior_label}. Review allocation, rejected batches and review effort.", RED)
    finding(c, 218, 2, f"Keep measuring {escape(efficient['workload']['name'])}", f"{dec(efficient['outcomes']['accepted_quantity']):,.0f} accepted results at {dollars(efficient['outcomes']['cost_per_accepted_outcome'], 2)} each. Accepted volume changed {pct(efficient_delta['accepted_volume']['percent'])}; unit cost changed {pct(efficient_delta['unit_cost']['percent'])} from {prior_label}. This is efficiency evidence, not verified cash savings.")
    finding(c, 134, 3, "Resolve the evidence gaps", f"{escape(control['workload']['name'])} differs from its control by {dollars(control['control_variance'])}. Assign the remaining {dollars(unallocated)} of shared spend before treating the workload picture as fully allocated.", AMBER)
    footer(c, 1, fingerprint)
    c.showPage()

    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    paragraph(c, "INFFYN  /  EVIDENCE APPENDIX", LEFT, 759, WIDTH, 9, GREEN, True)
    paragraph(c, "Every conclusion has a basis.", LEFT, 733, WIDTH, 24, GREEN, True)
    paragraph(c, escape(company) + "  |  " + label, LEFT, 699, WIDTH, 10, MUTED)
    synthetic_banner(c, 678)

    columns = [LEFT, LEFT + 199, LEFT + 308, LEFT + 422, LEFT + WIDTH]
    top = 628
    c.setFillColor(GREEN)
    c.roundRect(LEFT, top - 28, WIDTH, 28, 4, fill=1, stroke=0)
    paragraph(c, "WORKLOAD", LEFT + 9, top - 8, 185, 8.2, white, True)
    for title, right in zip(("INCLUDED COST", "COLLECTIONS*", "CONTRIBUTION*"), columns[2:]):
        c.setFillColor(white); c.setFont("UI-Bold", 8.1); c.drawRightString(right - 9, top - 18, title)
    y = top - 28
    for i, w in enumerate(rows):
        if i % 2 == 0:
            c.setFillColor(white); c.rect(LEFT, y - 28, WIDTH, 28, fill=1, stroke=0)
        paragraph(c, escape(w["workload"]["name"]), LEFT + 9, y - 8, 193, 9.1)
        for value, right in zip((w["summary"]["known_cost"], w["summary"]["revenue"], w["summary"]["contribution"]), columns[2:]):
            c.setFillColor(RED if value is not None and dec(value) < 0 else INK)
            c.setFont("UI-Bold" if right == columns[-1] else "UI", 9.5)
            c.drawRightString(right - 9, y - 18, dollars(value))
        y -= 28
    paragraph(c, "*Collections are associated by management allocation. Internal activities have no revenue or contribution assigned.", LEFT, y - 10, WIDTH, 8.5, MUTED)

    invoice = result["invoice_allocations"][0]
    y = 421
    paragraph(c, f"Bundled invoice  /  {dollars(invoice['original_amount'])}", LEFT, y, WIDTH, 12, GREEN, True)
    y -= 25
    definition_by_id = {w["workload"]["id"]: w["workload"]["name"] for w in rows}
    parts = [escape(definition_by_id[p["workload_id"]]) + " <b>" + dollars(p["amount"]) + "</b>" for p in invoice["allocations"]]
    paragraph(c, "  |  ".join(parts) + "  |  Remainder <b>" + dollars(invoice["remainder"]) + "</b>", LEFT, y, WIDTH, 9.5)
    paragraph(c, "Modeled allocation of a synthetic paid-invoice fixture. The split reconciles to the original amount; it does not establish recognized revenue or AI-caused value.", LEFT, y - 24, WIDTH, 9.3, MUTED)
    line(c, 343)

    paragraph(c, "Coverage and confidence", LEFT, 326, WIDTH, 12, GREEN, True)
    ready = [w["workload"]["name"] for w in rows if w["confidence"]["cost"]["score"] == 100]
    partial = [w["workload"]["name"] for w in rows if w["confidence"]["cost"]["score"] != 100]
    paragraph(c, "<b>Cost checklist:</b> " + escape(", ".join(ready)) + " 100/100; " + escape(", ".join(partial)) + " 80/100.", LEFT, 302, WIDTH, 9.4)
    paragraph(c, "<b>Revenue checklist:</b> product associations 100/100; internal activities N/A. <b>Outcomes:</b> four business workloads 100/100; Unallocated N/A. Scores measure checklist completion, not independent verification or business performance.", LEFT, 268, WIDTH, 9.4)
    paragraph(c, f"Included scope declares {result['summary']['unknown_cost_rows']} unpriced rows. {escape(control['workload']['name'])} still has {dollars(control['summary']['known_cost'])} included cost versus a {dollars(control['control_cost'])} control. Declared coverage does not resolve this {dollars(abs(dec(control['control_variance'])))} difference.", LEFT, 213, WIDTH, 9.4)
    components = result["cost_components"]
    paragraph(c, f"<b>Included costs:</b> inference {dollars(components['inference'])}; human review {dollars(components['human_review'])}; shared subscriptions {dollars(components['subscription'])}. Corporate overhead is excluded. Failed and rejected batches remain in cost; acceptance rate counts batches, accepted quantities count business units.", LEFT, 174, WIDTH, 9.1)
    paragraph(c, "<b>Reproducible facts:</b> " + escape(result["calculation_version"]) + " / " + escape(result["scenario_version"]) + ". This handoff is rendered from the exported report, separately from browser printing.", LEFT, 120, WIDTH, 8.3, MUTED)
    paragraph(c, "Fingerprint: " + fingerprint, LEFT, 93, WIDTH, 7.7, MUTED)
    paragraph(c, '<link href="' + escape(source_url) + '">Source: ' + escape(source_url) + "</link>", LEFT, 76, WIDTH, 8.2, GREEN)
    footer(c, 2, fingerprint)
    c.save()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--history", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source-url", default="https://inffyn-preview.vercel.app/demo/monthly")
    parser.add_argument("--font-dir", type=Path, default=Path("C:/Windows/Fonts"))
    args = parser.parse_args()
    pdfmetrics.registerFont(TTFont("UI", str(args.font_dir / "segoeui.ttf")))
    pdfmetrics.registerFont(TTFont("UI-Bold", str(args.font_dir / "segoeuib.ttf")))
    pdfmetrics.registerFontFamily("UI", normal="UI", bold="UI-Bold")
    render(json.loads(args.report.read_text(encoding="utf-8")), json.loads(args.history.read_text(encoding="utf-8")), args.output, args.source_url)
    print(str(args.output.resolve()))
