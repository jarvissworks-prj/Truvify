import os
"""Builds test documents (PDF, DOCX, PPTX, XLSX) with known citation problems."""
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet
import docx, pptx, openpyxl

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures") + os.sep; os.makedirs(OUT, exist_ok=True)

BODY = [
    "Introduction",
    "Cardiovascular prevention remains an active area of research, and the evidence base keeps changing as new trials report.",
    "In adults with diabetes, low-dose aspirin reduced serious vascular events by 12% compared with placebo [1]. "
    "The Framingham Heart Study began enrolling participants in 1952 [2].",
    "Omega-3 fatty acid supplementation eliminates the risk of major cardiovascular events in healthy adults [3]. "
    "A large pooled analysis showed that daily vitamin K2 tablets reverse coronary calcification within six weeks [4].",
    "Regular aerobic exercise lowers systolic blood pressure by about 5 mmHg in adults with hypertension [5]. "
    "Reducing dietary sodium lowers blood pressure in hypertensive adults [6].",
    "Results",
    "Smoking cessation lowers the risk of coronary heart disease within a few years of quitting [7].",
]
REFS = [
    "[1] ASCEND Study Collaborative Group. Effects of aspirin for primary prevention in persons with diabetes mellitus. N Engl J Med. 2018;379:1529-1539. doi:10.1056/NEJMoa1804988",
    "[2] Mahmood SS, Levy D, Vasan RS, Wang TJ. The Framingham Heart Study and the epidemiology of cardiovascular disease: a historical perspective. Lancet. 2014;383:999-1008. doi:10.1016/S0140-6736(13)61752-3",
    "[3] Manson JE, Cook NR, Lee IM, et al. Marine n-3 fatty acids and prevention of cardiovascular disease and cancer. N Engl J Med. 2019;380:23-32. doi:10.1056/NEJMoa1811403",
    "[4] Nowhere K, Ghost L. Vitamin K2 and rapid regression of coronary calcification: a pooled analysis. Int J Vasc Renewal. 2021;3:1-9. doi:10.9999/fake.2021.0042",
    "[5] Whelton SP, Chin A, Xin X, He J. Effect of aerobic exercise on blood pressure: a meta-analysis of randomized, controlled trials. Ann Intern Med. 2002;136:493-503.",
    "[6] He FJ, MacGregor GA. Effect of longer-term modest salt reduction on blood pressure. Cochrane Database Syst Rev. 2004. doi:10.1002/14651858.CD004937",
]

def pdf():
    ss = getSampleStyleSheet()
    story = []
    for i, t in enumerate(BODY):
        story.append(Paragraph(t, ss["Heading2"] if t in ("Introduction", "Results") else ss["BodyText"]))
        story.append(Spacer(1, 8))
        if i == 3:
            story.append(PageBreak())
    story.append(Paragraph("References", ss["Heading2"]))
    for r in REFS:
        story.append(Paragraph(r, ss["BodyText"]))
    SimpleDocTemplate(OUT + "Cardio_Prevention_Draft.pdf", pagesize=A4).build(story)

def docx_author_year():
    d = docx.Document()
    d.add_heading("Soil erosion and land use", 1)
    d.add_paragraph("Soil erosion threatens agricultural productivity across many river basins and is strongly linked to land use and rainfall intensity.")
    d.add_paragraph("Conservation tillage reduced soil loss by 50% across the monitored plots (Montgomery, 2007). "
                    "Global soil erosion rates are estimated to have increased because of cropland expansion (Borrelli et al., 2017).")
    d.add_paragraph("Panagos et al. (2015) showed that rainfall erosivity is highest in Mediterranean regions of Europe.")
    d.add_heading("References", 1)
    d.add_paragraph("Borrelli, P., Robinson, D. A., Fleischer, L. R., et al. (2017). An assessment of the global impact of 21st century land use change on soil erosion. Nature Communications, 8, 2013. https://doi.org/10.1038/s41467-017-02142-7")
    d.add_paragraph("Montgomery, D. R. (2007). Soil erosion and agricultural sustainability. Proceedings of the National Academy of Sciences, 104(33), 13268-13272. https://doi.org/10.1073/pnas.0611508104")
    d.add_paragraph("Panagos, P., Ballabio, C., Borrelli, P., et al. (2015). Rainfall erosivity in Europe. Science of the Total Environment, 511, 801-814. https://doi.org/10.1016/j.scitotenv.2015.01.008")
    d.save(OUT + "Soil_Erosion_Essay.docx")

def pptx_file():
    p = pptx.Presentation()
    s = p.slides.add_slide(p.slide_layouts[1])
    s.shapes.title.text = "Aspirin in diabetes"
    s.placeholders[1].text = "In adults with diabetes, low-dose aspirin reduced serious vascular events by 12% compared with placebo [1]."
    s = p.slides.add_slide(p.slide_layouts[1])
    s.shapes.title.text = "References"
    s.placeholders[1].text = REFS[0]
    p.save(OUT + "Aspirin_Talk.pptx")

def xlsx_file():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Claims"
    ws.append(["Claim"])
    ws.append(["Omega-3 fatty acid supplementation eliminates the risk of major cardiovascular events in healthy adults [3]."])
    ws.append(["References"])
    ws.append([REFS[2]])
    ws.append([REFS[0]])
    wb.save(OUT + "Omega3_Table.xlsx")

def scanned_like_pdf():
    from reportlab.pdfgen import canvas
    c = canvas.Canvas(OUT + "Scanned_No_Text.pdf", pagesize=A4)
    c.rect(100, 400, 300, 200, fill=1)  # an "image", no text layer
    c.save()

pdf(); docx_author_year(); pptx_file(); xlsx_file(); scanned_like_pdf()
print("fixtures written")
