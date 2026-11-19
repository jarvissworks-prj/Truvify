// Reads the text out of an uploaded file, entirely in the browser.
// Used by demo mode so every upload is analysed on its own content.
//
// Returns one string per page (PDF page, PPTX slide, XLSX sheet; DOCX is one page)
// so claims can be tagged with a page number.

export interface ExtractedDoc {
  pages: string[];
  pageCount: number;
  format: string;
}

const decodeXml = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** Tidy raw extracted text: join hyphenated line breaks, collapse spaces, keep paragraph breaks. */
export function tidy(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/­/g, "") // soft hyphen
    .replace(/[   ]/g, " ")
    .replace(/(\w)-\n(\w)/g, "$1$2") // "evi-\ndence" -> "evidence"
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(file: File): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const workerUrl = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let out = "";
    let lastY: number | null = null;
    for (const item of content.items as Array<{ str?: string; hasEOL?: boolean; transform?: number[] }>) {
      if (typeof item.str !== "string") continue;
      const y = item.transform?.[5] ?? null;
      // A big vertical jump between items means a new line/paragraph.
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2 && !out.endsWith("\n")) {
        out += Math.abs(y - lastY) > 18 ? "\n\n" : "\n";
      }
      out += item.str;
      if (item.hasEOL) out += "\n";
      if (y !== null) lastY = y;
    }
    pages.push(out);
    page.cleanup();
  }
  await pdf.destroy();
  return pages;
}

function wordXmlToText(xml: string): string {
  // One paragraph per <w:p>; keep tabs and line breaks.
  const token = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br[^>]*\/>/g;
  return xml
    .split(/<\/w:p>/)
    .map((p) => {
      let out = "";
      for (const m of p.matchAll(token)) {
        if (m[1] !== undefined) out += m[1];
        else out += m[0].startsWith("<w:tab") ? " " : "\n";
      }
      return decodeXml(out).trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

async function extractDocx(file: File): Promise<string[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const main = await zip.file("word/document.xml")?.async("string");
  if (!main) throw new Error("This Word file could not be read.");
  let text = wordXmlToText(main);
  // Reference lists are sometimes stored as Word endnotes/footnotes.
  for (const part of ["word/endnotes.xml", "word/footnotes.xml"]) {
    const xml = await zip.file(part)?.async("string");
    const notes = xml ? wordXmlToText(xml) : "";
    if (notes.length > 40 && !/\n\s*(references|bibliography|works cited)\s*\n/i.test(text)) {
      text += `\n\nReferences\n\n${notes}`;
    }
  }
  return [text];
}

async function extractPptx(file: File): Promise<string[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]));
  const pages: string[] = [];
  for (const name of slides) {
    const xml = await zip.file(name)!.async("string");
    const paras = xml
      .split(/<\/a:p>/)
      .map((p) =>
        decodeXml(
          (p.match(/<a:t>([\s\S]*?)<\/a:t>/g) ?? []).map((t) => t.replace(/<\/?a:t>/g, "")).join(""),
        ).trim(),
      )
      .filter(Boolean);
    pages.push(paras.join("\n"));
  }
  return pages;
}

async function extractXlsx(file: File): Promise<string[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  return wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, blankrows: false, defval: "" });
    return rows
      .map((r) => r.map((c) => String(c ?? "").trim()).filter(Boolean).join(" "))
      .filter(Boolean)
      .join("\n");
  });
}

export async function extractText(file: File): Promise<ExtractedDoc> {
  const format = (file.name.split(".").pop() || "").toLowerCase();
  let pages: string[];
  if (format === "pdf") pages = await extractPdf(file);
  else if (format === "docx") pages = await extractDocx(file);
  else if (format === "pptx") pages = await extractPptx(file);
  else if (format === "xlsx") pages = await extractXlsx(file);
  else throw new Error("Only PDF, DOCX, XLSX, and PPTX files are accepted.");
  pages = pages.map(tidy);
  return { pages, pageCount: pages.length, format };
}

// Cache so the domain check and the verification don't parse the same file twice.
const cache = new Map<string, Promise<ExtractedDoc>>();
export function extractTextCached(file: File): Promise<ExtractedDoc> {
  const key = `${file.name}-${file.size}-${file.lastModified}`;
  let p = cache.get(key);
  if (!p) {
    p = extractText(file);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}
