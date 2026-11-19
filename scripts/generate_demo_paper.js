import { jsPDF } from "jspdf";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const doc = new jsPDF({
  orientation: "portrait",
  unit: "mm",
  format: "a4",
});

// Setup styles
const pageWidth = doc.internal.pageSize.getWidth();
const margin = 20;
const contentWidth = pageWidth - margin * 2;

// Header / Title
doc.setFont("helvetica", "bold");
doc.setFontSize(18);
doc.setTextColor(20, 20, 20);
doc.text("Cardiovascular Prevention & Evidence Evaluation", margin, 25);

doc.setFont("helvetica", "normal");
doc.setFontSize(10);
doc.setTextColor(100, 100, 100);
doc.text("Draft Manuscript for Clinical Peer Review · Working Document", margin, 32);

// Horizontal divider
doc.setDrawColor(220, 220, 220);
doc.setLineWidth(0.5);
doc.line(margin, 36, pageWidth - margin, 36);

let y = 46;

// Abstract section
doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.setTextColor(30, 30, 30);
doc.text("Abstract", margin, y);
y += 6;

doc.setFont("helvetica", "italic");
doc.setFontSize(9.5);
doc.setTextColor(60, 60, 60);
const abstractText = "This synthesis examines the therapeutic efficacy and evidentiary strength of standard pharmacological and behavioral interventions in primary and secondary cardiovascular prophylaxis. Recent trial publications necessitate a systematic reassessment of earlier guideline thresholds.";
const abstractLines = doc.splitTextToSize(abstractText, contentWidth);
doc.text(abstractLines, margin, y);
y += abstractLines.length * 5 + 6;

// Section 1: Introduction
doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.setTextColor(30, 30, 30);
doc.text("1. Introduction", margin, y);
y += 6;

doc.setFont("helvetica", "normal");
doc.setFontSize(10);
doc.setTextColor(40, 40, 40);
const p1 = "Cardiovascular disease remains the leading cause of global mortality. While lifestyle modification remains fundamental, pharmacological adjuncts are central to modern risk-reduction strategies. This paper reviews the underlying trial data supporting contemporary clinical guidelines.";
const p1Lines = doc.splitTextToSize(p1, contentWidth);
doc.text(p1Lines, margin, y);
y += p1Lines.length * 5.5 + 4;

// Section 2: Clinical Findings & Evidence
doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.setTextColor(30, 30, 30);
doc.text("2. Clinical Findings & Evidence", margin, y);
y += 6;

doc.setFont("helvetica", "normal");
doc.setFontSize(10);
doc.setTextColor(40, 40, 40);

const claims = [
  "In adults with diabetes, low-dose aspirin reduced serious vascular events by 12% compared with placebo [1].",
  "The landmark Framingham Heart Study began enrolling participants in 1952 [2].",
  "Omega-3 fatty acid supplementation eliminates the risk of major cardiovascular events in healthy adults [3].",
  "A large pooled analysis showed that daily vitamin K2 tablets reverse coronary calcification within six weeks [4].",
  "Regular aerobic exercise lowers systolic blood pressure by about 5 mmHg in adults with hypertension [5].",
  "Reducing dietary sodium intake is associated with lower blood pressure in hypertensive adults [6]."
];

for (const c of claims) {
  const lines = doc.splitTextToSize(c, contentWidth);
  doc.text(lines, margin, y);
  y += lines.length * 5.5 + 2.5;
}

y += 4;

// Section 3: Discussion
doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.setTextColor(30, 30, 30);
doc.text("3. Discussion", margin, y);
y += 6;

doc.setFont("helvetica", "normal");
doc.setFontSize(10);
doc.setTextColor(40, 40, 40);
const p2 = "Discrepancies between observational claims and randomized trials emphasize the necessity for continuous literature verification. Automated citation integrity checks ensure that reported figures accurately reflect the indexed source publications.";
const p2Lines = doc.splitTextToSize(p2, contentWidth);
doc.text(p2Lines, margin, y);
y += p2Lines.length * 5.5 + 6;

// Section 4: References
doc.setFont("helvetica", "bold");
doc.setFontSize(12);
doc.setTextColor(30, 30, 30);
doc.text("References", margin, y);
y += 6;

doc.setFont("helvetica", "normal");
doc.setFontSize(8.5);
doc.setTextColor(70, 70, 70);

const refs = [
  "[1] ASCEND Study Collaborative Group. Effects of aspirin for primary prevention in persons with diabetes mellitus. N Engl J Med. 2018;379:1529-1539. doi:10.1056/NEJMoa1804988",
  "[2] Mahmood SS, Levy D, Vasan RS, Wang TJ. The Framingham Heart Study and the epidemiology of cardiovascular disease: a historical perspective. Lancet. 2014;383:999-1008. doi:10.1016/S0140-6736(13)61752-3",
  "[3] Manson JE, Cook NR, Lee IM, et al. Marine n-3 fatty acids and prevention of cardiovascular disease and cancer. N Engl J Med. 2019;380:23-32. doi:10.1056/NEJMoa1811403",
  "[4] Nowhere K, Ghost L. Vitamin K2 and rapid regression of coronary calcification: a pooled analysis. Int J Vasc Renewal. 2021;3:1-9. doi:10.9999/fake.2021.0042",
  "[5] Whelton SP, Chin A, Xin X, He J. Effect of aerobic exercise on blood pressure: a meta-analysis of randomized, controlled trials. Ann Intern Med. 2002;136:493-503.",
  "[6] He FJ, MacGregor GA. Effect of longer-term modest salt reduction on blood pressure. Cochrane Database Syst Rev. 2004. doi:10.1002/14651858.CD004937"
];

for (const r of refs) {
  const rLines = doc.splitTextToSize(r, contentWidth);
  doc.text(rLines, margin, y);
  y += rLines.length * 4.2 + 2;
}

// Save files
const publicDir = path.join(__dirname, "..", "public", "demo_papers");
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const targetFile = path.join(publicDir, "Truvify_Verification_Demo_Paper.pdf");
const rootTarget = path.join(__dirname, "..", "Truvify_Verification_Demo_Paper.pdf");

const buffer = Buffer.from(doc.output("arraybuffer"));
fs.writeFileSync(targetFile, buffer);
fs.writeFileSync(rootTarget, buffer);

console.log("PDF generated successfully at:", targetFile);
