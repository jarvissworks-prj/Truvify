import * as XLSX from "xlsx";
import pptxgen from "pptxgenjs";
import { jsPDF } from "jspdf";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { backend } from "./api";
import { BACKEND_MODE, DEMO_MODE } from "./config";
import type { Claim, DocumentRecord, ExportFormat, Verdict } from "./types";
import { effectiveVerdict, flagFor, trustScore, VERDICT_ORDER, VERDICTS } from "./verdicts";
import { DISCLAIMER } from "./disclaimer";

export { DISCLAIMER };

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const baseName = (doc: DocumentRecord) => `Truvify_${doc.file_name.replace(/\.[^.]+$/, "")}`;

const escHtml = (s: string | null | undefined) =>
  (s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** Demo-mode PDF: opens a clean printable report; the browser saves it as PDF. */
function printReport(doc: DocumentRecord, claims: Claim[]) {
  const score = trustScore(claims);
  const w = window.open("", "_blank");
  if (!w) return;
  const rows = claims
    .map(
      (c, i) => `
      <section>
        <div class="row"><b>Claim ${i + 1}</b><span class="pill">${VERDICTS[effectiveVerdict(c)].label}${c.user_override_verdict ? " · User reviewed" : ""}${c.user_flagged ? " · Flagged" : ""}</span></div>
        <p class="claim">${escHtml(c.claim_text)}</p>
        <p class="muted">${escHtml(c.citation_id)} ${escHtml(c.citation_full_reference)}</p>
        <blockquote>${escHtml(c.evidence_quote) || "No direct evidence found in the available text."}</blockquote>
        <p>${escHtml(c.explanation)}</p>
        <p class="muted">Evidence strength: ${c.evidence_strength ?? "—"} · Source used: ${c.retrieval_quality ?? "—"}<br/>${escHtml(c.uncertainty_note)}</p>
        ${c.user_override_reason ? `<p class="muted">Override reason: ${escHtml(c.user_override_reason)}</p>` : ""}
      </section>`,
    )
    .join("");
  w.document.write(`<!doctype html><html><head><title>${escHtml(baseName(doc))}</title>
  <style>
    body{font-family:Geist,system-ui,sans-serif;color:#1a1a1a;max-width:760px;margin:40px auto;padding:0 24px;font-size:13px;line-height:1.55}
    h1{font-size:22px;margin:0 0 4px} .muted{color:#737373;font-size:12px}
    section{border-top:1px solid #eaeaea;padding:14px 0;page-break-inside:avoid}
    .row{display:flex;justify-content:space-between;align-items:center}
    .pill{border:1px solid #eaeaea;border-radius:99px;padding:2px 10px;font-size:11px}
    .claim{font-size:14px;font-weight:500} blockquote{margin:8px 0;padding:6px 12px;border-left:3px solid #0a0a0a;background:#fafafa}
    footer{margin-top:24px;padding-top:12px;border-top:1px solid #eaeaea;color:#737373;font-size:11px}
  </style></head><body>
  <h1>Truvify verification report</h1>
  <p class="muted">${escHtml(doc.file_name)} · ${doc.domain ?? ""} · ${claims.length} claims · Trust score ${score}/100</p>
  ${rows}
  <footer>${DISCLAIMER}</footer>
  <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script>
  </body></html>`);
  w.document.close();
}

/** Demo-mode Word (DOCX): generated in browser with docx package */
async function buildDocxReport(doc: DocumentRecord, claims: Claim[]) {
  const score = trustScore(claims);
  const docxDoc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: "Truvify verification report",
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 120 },
          }),
          new Paragraph({
            text: `${doc.file_name} · ${doc.domain ?? "General"} · ${claims.length} claims · Trust score ${score}/100`,
            spacing: { after: 300 },
          }),
          ...claims.flatMap((c, i) => {
            const vLabel = VERDICTS[effectiveVerdict(c)].label;
            const extra = [
              c.user_override_verdict ? "User reviewed" : "",
              c.user_flagged ? "Flagged" : "",
            ].filter(Boolean).join(" · ");

            return [
              new Paragraph({
                text: `Claim ${i + 1} — ${vLabel}${extra ? ` (${extra})` : ""}`,
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 240, after: 100 },
              }),
              new Paragraph({
                children: [new TextRun({ text: c.claim_text, bold: true })],
                spacing: { after: 80 },
              }),
              new Paragraph({
                text: `${c.citation_id ?? ""} ${c.citation_full_reference ?? ""}`.trim(),
                spacing: { after: 80 },
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Evidence: ${c.evidence_quote || "No direct evidence found in the available text."}`,
                    italics: true,
                  }),
                ],
                spacing: { after: 80 },
              }),
              new Paragraph({
                text: `Explanation: ${c.explanation || "—"}`,
                spacing: { after: 80 },
              }),
              new Paragraph({
                text: `Evidence strength: ${c.evidence_strength ?? "—"} · Source used: ${c.retrieval_quality ?? "—"}${c.uncertainty_note ? ` · ${c.uncertainty_note}` : ""}`,
                spacing: { after: 80 },
              }),
              ...(c.user_override_reason
                ? [
                    new Paragraph({
                      text: `Override reason: ${c.user_override_reason}`,
                      spacing: { after: 80 },
                    }),
                  ]
                : []),
            ];
          }),
          new Paragraph({
            text: `Disclaimer: ${DISCLAIMER}`,
            spacing: { before: 400 },
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(docxDoc);
  downloadBlob(blob, `${baseName(doc)}.docx`);
}

/** Excel (XLSX): generated in browser with xlsx package */
function buildExcelReport(doc: DocumentRecord, claims: Claim[]) {
  const score = trustScore(claims);
  const flag = flagFor(score);

  // 1. Summary sheet
  const verdictCounts: Record<Verdict, number> = {
    supported: 0,
    partly_supported: 0,
    unsupported: 0,
    contradicted: 0,
    not_found: 0,
    likely_fabricated: 0,
  };
  claims.forEach((c) => {
    verdictCounts[effectiveVerdict(c)]++;
  });

  const summaryData = [
    ["Metric", "Value"],
    ["File Name", doc.file_name],
    ["Domain", doc.domain ?? "—"],
    ["Date", doc.created_at],
    ["Total Claims", claims.length],
    ["Trust Score", score],
    ["Flag", flag],
    ["", ""],
    ["Verdict Counts", ""],
    ...VERDICT_ORDER.map((v) => [VERDICTS[v].label, verdictCounts[v]]),
    ["", ""],
    ["Disclaimer", DISCLAIMER],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 22 }, { wch: 60 }];

  // 2. Claims sheet
  const claimsHeaders = [
    "page",
    "citation",
    "claim",
    "full_reference",
    "doi",
    "agent_verdict",
    "user_override_verdict",
    "user_override_reason",
    "final_verdict",
    "evidence_quote",
    "explanation",
    "evidence_strength",
    "source_used",
    "uncertainty_note",
    "date_conflict",
    "outdated",
    "newer_paper",
    "needs_human_review",
    "user_flagged",
    "fabrication_signals_failed",
    "edited",
    "suggested_fix",
  ];

  const isClaimEdited = (c: Claim) =>
    !!doc.corrected_text && (
      (doc.extracted_text && !doc.extracted_text.includes(c.claim_text.trim())) ||
      !doc.corrected_text.includes(c.claim_text.trim()) ||
      (c.uncertainty_note?.includes("Re-verified") ?? false)
    );

  const claimsRows = claims.map((c) => [
    c.page_number ?? "",
    c.citation_id ?? "",
    c.claim_text,
    c.citation_full_reference ?? "",
    c.citation_doi ?? "",
    c.verdict,
    c.user_override_verdict ?? "",
    c.user_override_reason ?? "",
    effectiveVerdict(c),
    c.evidence_quote ?? "",
    c.explanation ?? "",
    c.evidence_strength ?? "",
    c.retrieval_quality ?? "",
    c.uncertainty_note ?? "",
    c.date_conflict ? `${c.date_conflict.claimed_date} → ${c.date_conflict.actual_date}` : "",
    c.outdated ? "true" : "false",
    c.newer_paper ? `${c.newer_paper.title} (${c.newer_paper.year})` : "",
    c.needs_human_review ? "true" : "false",
    c.user_flagged ? "true" : "false",
    c.fabrication_signals_failed,
    isClaimEdited(c) ? "true" : "false",
    c.suggested_fix ?? "",
  ]);

  const wsClaims = XLSX.utils.aoa_to_sheet([claimsHeaders, ...claimsRows]);
  wsClaims["!cols"] = [
    { wch: 8 },
    { wch: 10 },
    { wch: 45 },
    { wch: 40 },
    { wch: 25 },
    { wch: 18 },
    { wch: 20 },
    { wch: 25 },
    { wch: 18 },
    { wch: 45 },
    { wch: 45 },
    { wch: 16 },
    { wch: 18 },
    { wch: 35 },
    { wch: 20 },
    { wch: 10 },
    { wch: 30 },
    { wch: 18 },
    { wch: 12 },
    { wch: 22 },
    { wch: 10 },
    { wch: 45 },
  ];
  wsClaims["!views"] = [{ state: "frozen", ySplit: 1 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");
  XLSX.utils.book_append_sheet(wb, wsClaims, "Claims");

  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${baseName(doc)}.xlsx`,
  );
}

/** PowerPoint (PPTX): generated in browser with pptxgenjs */
async function buildPptxReport(doc: DocumentRecord, claims: Claim[]) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";

  const score = trustScore(claims);
  const flag = flagFor(score);

  const flagColors: Record<string, string> = {
    green: "10B981",
    amber: "F59E0B",
    red: "EF4444",
  };

  const verdictColors: Record<Verdict, string> = {
    supported: "10B981",
    partly_supported: "F59E0B",
    unsupported: "F97316",
    contradicted: "EF4444",
    not_found: "9CA3AF",
    likely_fabricated: "DC2626",
  };

  const addFooter = (slide: pptxgen.Slide) => {
    slide.addText(DISCLAIMER, {
      x: 0.5,
      y: 7.0,
      w: 12.3,
      h: 0.35,
      fontSize: 7.5,
      color: "737373",
      align: "center",
    });
  };

  // Slide 1: Title
  const s1 = pptx.addSlide();
  s1.background = { color: "FFFFFF" };
  s1.addText("Truvify verification report", {
    x: 0.8,
    y: 2.0,
    w: 11.5,
    h: 0.8,
    fontSize: 32,
    bold: true,
    color: "0A0A0A",
  });
  s1.addText(`File: ${doc.file_name} · Domain: ${doc.domain ?? "General"} · ${claims.length} claims`, {
    x: 0.8,
    y: 3.0,
    w: 11.5,
    h: 0.5,
    fontSize: 16,
    color: "525252",
  });
  s1.addText(`Trust score: ${score}/100`, {
    x: 0.8,
    y: 3.8,
    w: 5.0,
    h: 0.6,
    fontSize: 22,
    bold: true,
    color: flagColors[flag] || "0A0A0A",
  });
  addFooter(s1);

  // Slide 2: Verdict summary
  const s2 = pptx.addSlide();
  s2.background = { color: "FFFFFF" };
  s2.addText("Verdict summary", {
    x: 0.8,
    y: 0.8,
    w: 11.5,
    h: 0.6,
    fontSize: 24,
    bold: true,
    color: "0A0A0A",
  });

  const verdictCounts: Record<Verdict, number> = {
    supported: 0,
    partly_supported: 0,
    unsupported: 0,
    contradicted: 0,
    not_found: 0,
    likely_fabricated: 0,
  };
  claims.forEach((c) => {
    verdictCounts[effectiveVerdict(c)]++;
  });

  VERDICT_ORDER.forEach((v, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = 0.8 + col * 4.0;
    const y = 1.8 + row * 2.2;

    s2.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: 3.6,
      h: 1.8,
      fill: { color: "F9FAFB" },
      line: { color: "E5E7EB", width: 1 },
      rectRadius: 0.1,
    });
    s2.addText(VERDICTS[v].label, {
      x: x + 0.3,
      y: y + 0.3,
      w: 3.0,
      h: 0.4,
      fontSize: 14,
      bold: true,
      color: verdictColors[v],
    });
    s2.addText(`${verdictCounts[v]} claims`, {
      x: x + 0.3,
      y: y + 0.8,
      w: 3.0,
      h: 0.6,
      fontSize: 24,
      bold: true,
      color: "0A0A0A",
    });
  });
  addFooter(s2);

  // Claim slides: one per claim
  claims.forEach((c, i) => {
    const sc = pptx.addSlide();
    sc.background = { color: "FFFFFF" };
    const ev = effectiveVerdict(c);

    sc.addText(`Claim ${i + 1} of ${claims.length} — ${VERDICTS[ev].label}`, {
      x: 0.8,
      y: 0.6,
      w: 11.5,
      h: 0.5,
      fontSize: 18,
      bold: true,
      color: verdictColors[ev],
    });

    sc.addText(c.claim_text, {
      x: 0.8,
      y: 1.3,
      w: 11.5,
      h: 0.9,
      fontSize: 14,
      bold: true,
      color: "0A0A0A",
      wrap: true,
    });

    if (c.citation_full_reference) {
      sc.addText(`Citation: ${c.citation_id ?? ""} ${c.citation_full_reference}`, {
        x: 0.8,
        y: 2.3,
        w: 11.5,
        h: 0.4,
        fontSize: 11,
        color: "737373",
      });
    }

    sc.addText(
      `Evidence quote: "${c.evidence_quote || "No direct evidence found in the available text."}"`,
      {
        x: 0.8,
        y: 2.8,
        w: 11.5,
        h: 1.1,
        fontSize: 12,
        italic: true,
        color: "374151",
        wrap: true,
      },
    );

    sc.addText(`Explanation: ${c.explanation || "—"}`, {
      x: 0.8,
      y: 4.1,
      w: 11.5,
      h: 0.9,
      fontSize: 12,
      color: "1F2937",
      wrap: true,
    });

    sc.addText(
      `Confidence: Strength: ${c.evidence_strength ?? "—"} · Source: ${c.retrieval_quality ?? "—"}${c.uncertainty_note ? ` · Note: ${c.uncertainty_note}` : ""}`,
      {
        x: 0.8,
        y: 5.2,
        w: 11.5,
        h: 0.5,
        fontSize: 11,
        color: "525252",
      },
    );

    if (c.user_override_reason) {
      sc.addText(`Override reason: ${c.user_override_reason}`, {
        x: 0.8,
        y: 5.8,
        w: 11.5,
        h: 0.4,
        fontSize: 11,
        italic: true,
        color: "047857",
      });
    }

    addFooter(sc);
  });

  // Last slide: Disclaimer
  const sLast = pptx.addSlide();
  sLast.background = { color: "FFFFFF" };
  sLast.addText("Disclaimer & Methodology", {
    x: 0.8,
    y: 1.5,
    w: 11.5,
    h: 0.6,
    fontSize: 24,
    bold: true,
    color: "0A0A0A",
  });
  sLast.addText(DISCLAIMER, {
    x: 0.8,
    y: 2.5,
    w: 11.0,
    h: 2.5,
    fontSize: 16,
    color: "525252",
    wrap: true,
  });
  addFooter(sLast);

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  downloadBlob(blob, `${baseName(doc)}.pptx`);
}

export async function exportReport(
  doc: DocumentRecord,
  claims: Claim[],
  format: ExportFormat,
): Promise<void> {
  const name = baseName(doc);

  if (format === "xlsx") {
    return buildExcelReport(doc, claims);
  }

  if (format === "pptx") {
    return buildPptxReport(doc, claims);
  }

  if (format === "pdf") {
    if (DEMO_MODE || BACKEND_MODE === "browser") return printReport(doc, claims);
    const blob = await backend.exportFile(doc.id, "pdf");
    return downloadBlob(blob, `${name}.pdf`);
  }

  if (format === "docx") {
    if (DEMO_MODE || BACKEND_MODE === "browser") return buildDocxReport(doc, claims);
    const blob = await backend.exportFile(doc.id, "docx");
    return downloadBlob(blob, `${name}.docx`);
  }
}

/** Download corrected document in the original format (PDF, DOCX, PPTX, XLSX) */
export async function downloadCorrectedDocument(doc: DocumentRecord, correctedText: string): Promise<void> {
  const ext = (doc.file_format || doc.file_name.split(".").pop() || "pdf").toLowerCase();
  const rawBase = doc.file_name.replace(/\.[^.]+$/, "");
  const outName = `${rawBase}_corrected.${ext}`;

  const paragraphs = correctedText
    .split(/\n\n+|\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (ext === "docx") {
    const docxDoc = new Document({
      sections: [
        {
          children: paragraphs.map(
            (p) =>
              new Paragraph({
                text: p,
                spacing: { after: 200, line: 360 },
              }),
          ),
        },
      ],
    });
    const blob = await Packer.toBlob(docxDoc);
    downloadBlob(blob, outName);
    return;
  }

  if (ext === "pptx") {
    const pptx = new pptxgen();
    pptx.layout = "LAYOUT_16x9";

    const titleSlide = pptx.addSlide();
    titleSlide.background = { color: "FFFFFF" };
    titleSlide.addText("Corrected document", {
      x: 1.0,
      y: 2.2,
      w: 11.0,
      h: 0.8,
      fontSize: 28,
      bold: true,
      color: "0A0A0A",
    });
    titleSlide.addText(doc.file_name, {
      x: 1.0,
      y: 3.2,
      w: 11.0,
      h: 0.5,
      fontSize: 16,
      color: "737373",
    });

    paragraphs.forEach((p) => {
      const s = pptx.addSlide();
      s.background = { color: "FFFFFF" };
      s.addText(p, {
        x: 1.0,
        y: 1.2,
        w: 11.0,
        h: 5.0,
        fontSize: 14,
        color: "0A0A0A",
        wrap: true,
      });
    });

    const blob = (await pptx.write({ outputType: "blob" })) as Blob;
    downloadBlob(blob, outName);
    return;
  }

  if (ext === "xlsx") {
    const rows = paragraphs.map((p) => [p]);
    const ws = XLSX.utils.aoa_to_sheet([["Corrected"], ...rows]);
    ws["!cols"] = [{ wch: 100 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Corrected");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    downloadBlob(
      new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      outName,
    );
    return;
  }

  // Default to PDF (for .pdf or other formats)
  const pdf = new jsPDF({ format: "a4", unit: "mm" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  const margin = 20;
  const pageWidth = 210;
  const pageHeight = 297;
  const maxWidth = pageWidth - margin * 2;
  let cursorY = margin;
  const lineHeight = 6;

  paragraphs.forEach((para) => {
    const lines = pdf.splitTextToSize(para, maxWidth);
    if (cursorY + lines.length * lineHeight > pageHeight - margin) {
      pdf.addPage();
      cursorY = margin;
    }
    pdf.text(lines, margin, cursorY);
    cursorY += lines.length * lineHeight + 5;
  });

  pdf.save(outName);
}
