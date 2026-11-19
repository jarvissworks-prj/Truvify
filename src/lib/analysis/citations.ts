// Finds the reference list and every cited sentence ("claim") in a document.
// Handles numbered markers — [3], [1, 2], [4–6] — and author–year markers —
// (Smith, 2019), (Smith et al., 2019; Lee 2020), Smith et al. (2019).

import type { Domain } from "../types";

export interface ReferenceEntry {
  key: string; // "3" for numbered lists, "smith-2019" for author–year
  text: string;
  doi: string | null;
  year: number | null;
  firstAuthor: string | null;
}

export interface FoundClaim {
  sentence: string; // exact substring of the prepared document text
  marker: string; // as written, e.g. "[3]" or "(Smith et al., 2019)"
  refKeys: string[]; // keys into the reference map
  page: number;
}

export interface PreparedDoc {
  text: string; // body + reference list, used as the document's extracted_text
  claims: FoundClaim[];
  references: Map<string, ReferenceEntry>;
  hasReferenceList: boolean;
  truncated: boolean;
}

const MAX_CLAIMS = 60;
const REF_HEADING =
  /(?:^|\n)[ \t]*(?:\d+\.?[ \t]*)?(references|bibliography|works cited|literature cited|reference list|cited literature)[ \t]*:?[ \t]*(?=\n|$)/gi;

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const DOI_RE = /\b10\.\d{4,9}\/[^\s"<>]+/i;
export function cleanDoi(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(DOI_RE);
  return m ? m[0].replace(/[.,;:)\]}>]+$/, "") : null;
}

/** Join wrapped lines inside paragraphs, but keep short heading-like lines on their own. */
function flattenParagraphs(page: string): string {
  const lines = page.split("\n");
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    out += line;
    if (i === lines.length - 1) break;
    const next = lines[i + 1]!;
    if (line === "" || next === "") {
      out += "\n";
      continue;
    }
    const isRefHeading = (l: string) =>
      /^\s*(?:\d+\.?\s*)?(references|bibliography|works cited|literature cited|reference list|cited literature)\s*:?\s*$/i.test(l);
    const headingLike = line.length < 60 && !/[.,;:]$/.test(line) && /^[[(A-Z0-9]/.test(next);
    out += isRefHeading(line) || isRefHeading(next) || headingLike ? "\n\n" : " ";
  }
  return out.replace(/\n{3,}/g, "\n\n");
}

function parseReferences(refText: string): Map<string, ReferenceEntry> {
  const map = new Map<string, ReferenceEntry>();
  const add = (key: string, raw: string) => {
    const text = raw.replace(/\s+/g, " ").trim();
    if (text.length < 15) return;
    const yearM = text.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
    const authorM = text.match(/^[[(]?\d*[\]).]?\s*([\p{Lu}][\p{L}'’\-]+)/u);
    map.set(key, {
      key,
      text,
      doi: cleanDoi(text),
      year: yearM ? Number(yearM[1]) : null,
      firstAuthor: authorM ? fold(authorM[1]!) : null,
    });
  };

  // Numbered list: "[1] ..." or "1. ..." at the start of a line.
  const numbered = [...refText.matchAll(/(?:^|\n)[ \t]*(?:\[(\d{1,3})\]|(\d{1,3})\.)[ \t]+/g)];
  // One entry is enough if the list starts with it (e.g. a slide with a single reference).
  if (numbered.length >= 2 || (numbered.length === 1 && refText.slice(0, numbered[0]!.index!).trim() === "")) {
    numbered.forEach((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < numbered.length ? numbered[i + 1]!.index! : refText.length;
      add(m[1] ?? m[2]!, refText.slice(start, end));
    });
    // Re-key so firstAuthor is read from the entry text, not the number.
    for (const e of map.values()) {
      const a = e.text.match(/^([\p{Lu}][\p{L}'’\-]+)/u);
      e.firstAuthor = a ? fold(a[1]!) : null;
    }
    return map;
  }

  // Author–year list: blocks separated by blank lines, or lines that start with "Surname, X."
  let blocks = refText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length < 2) {
    blocks = [];
    let cur = "";
    for (const line of refText.split("\n")) {
      const starts = /^[\p{Lu}][\p{L}'’\-]+,\s+(?:[\p{Lu}]\.|[\p{Lu}][\p{L}]+)/u.test(line.trim());
      if (starts && cur && /[.)]\s*$/.test(cur.trim())) {
        blocks.push(cur);
        cur = line;
      } else cur += (cur ? " " : "") + line;
    }
    if (cur.trim()) blocks.push(cur);
  }
  blocks.forEach((b, i) => {
    const authorM = b.match(/^([\p{Lu}][\p{L}'’\-]+)/u);
    const yearM = b.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
    const key = authorM && yearM ? `${fold(authorM[1]!)}-${yearM[1]}` : `ref-${i + 1}`;
    if (map.has(key)) add(`${key}-${i}`, b);
    else add(key, b);
  });
  return map;
}

// Abbreviations that end in a full stop but don't end a sentence.
const ABBREV = /\b(et al|e\.g|i\.e|cf|vs|approx|Fig|Figs|Eq|Ref|Refs|No|Dr|Prof|Inc|Ltd|Jr|Sr|St|vol|pp|ca|resp)\.$/i;

/** Split a paragraph into sentences, returning [start, end) offsets. */
function sentenceSpans(text: string, base: number): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let start = 0;
  const re = /[.?!]["”’)\]]*\s+(?=["“(\[]?[\p{Lu}\d])/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const endOfSentence = m.index + m[0].trimEnd().length;
    const candidate = text.slice(start, endOfSentence);
    if (ABBREV.test(candidate) || /\b[A-Z]\.$/.test(candidate)) continue; // "Smith J." / "et al."
    spans.push([base + start, base + endOfSentence]);
    start = m.index + m[0].length;
  }
  if (start < text.length) spans.push([base + start, base + text.length]);
  return spans;
}

function expandNumbers(inner: string): string[] {
  const out: string[] = [];
  for (const part of inner.split(/\s*,\s*/)) {
    const r = part.match(/^(\d{1,3})\s*[-–]\s*(\d{1,3})$/);
    if (r) {
      const a = Number(r[1]);
      const b = Number(r[2]);
      for (let n = a; n <= b && n - a < 20; n++) out.push(String(n));
    } else if (/^\d{1,3}$/.test(part)) out.push(part);
  }
  return out;
}

function authorYearKeys(chunk: string, refs: Map<string, ReferenceEntry>): string[] {
  const keys: string[] = [];
  for (const part of chunk.split(";")) {
    const year = part.match(/\b(19[5-9]\d|20[0-4]\d)[a-z]?\b/);
    const name = part.replace(/\b(see|e\.g\.|cf\.|also)\b/gi, "").match(/([\p{Lu}][\p{L}'’\-]+)/u);
    if (!year || !name) continue;
    const surname = fold(name[1]!);
    const exact = `${surname}-${year[1]}`;
    if (refs.has(exact)) {
      keys.push(exact);
      continue;
    }
    const loose = [...refs.values()].find((r) => r.firstAuthor === surname && r.year === Number(year[1]));
    keys.push(loose ? loose.key : exact);
  }
  return keys;
}

export function prepareDocument(pages: string[]): PreparedDoc {
  const flatPages = pages.map(flattenParagraphs);
  let full = "";
  const pageStarts: number[] = [];
  flatPages.forEach((p, i) => {
    if (i > 0) full += "\n\n";
    pageStarts.push(full.length);
    full += p;
  });

  // Last "References" heading wins (a table of contents may mention it earlier).
  let refStart = -1;
  let refBodyStart = -1;
  for (const m of full.matchAll(REF_HEADING)) {
    if (m.index! > full.length * 0.2) {
      refStart = m.index!;
      refBodyStart = m.index! + m[0].length;
    }
  }
  const hasReferenceList = refStart >= 0;
  const bodyEnd = hasReferenceList ? refStart : full.length;
  // Reference parsing needs the original line breaks, so re-find the heading in the raw text.
  let rawRefs = "";
  if (hasReferenceList) {
    const raw = pages.join("\n\n");
    let rawStart = -1;
    for (const m of raw.matchAll(REF_HEADING)) if (m.index! > raw.length * 0.2) rawStart = m.index! + m[0].length;
    rawRefs = rawStart >= 0 ? raw.slice(rawStart) : full.slice(refBodyStart);
  }
  const references = parseReferences(rawRefs);

  const pageOf = (offset: number) => {
    let p = 1;
    for (let i = 0; i < pageStarts.length; i++) if (offset >= pageStarts[i]!) p = i + 1;
    return p;
  };

  const claims: FoundClaim[] = [];
  let truncated = false;
  const body = full.slice(0, bodyEnd);
  let paraStart = 0;
  for (const para of body.split("\n\n")) {
    for (const [s, e] of sentenceSpans(para, paraStart)) {
      const sentence = full.slice(s, e).trim();
      if (sentence.split(/\s+/).length < 6) continue;

      let marker = "";
      let refKeys: string[] = [];
      const num = [...sentence.matchAll(/\[(\d{1,3}(?:\s*[-–,]\s*\d{1,3})*)\]/g)];
      if (num.length) {
        marker = num.map((m) => m[0]).join("");
        refKeys = num.flatMap((m) => expandNumbers(m[1]!));
      } else {
        const paren = [...sentence.matchAll(/\(([^()]{3,160}?)\)/g)].filter(
          (m) => /\b(19[5-9]\d|20[0-4]\d)[a-z]?\b/.test(m[1]!) && /[\p{Lu}]/u.test(m[1]!),
        );
        const narrative = [
          ...sentence.matchAll(/([\p{Lu}][\p{L}'’\-]+(?:\s+(?:et al\.|and|&)\s*(?:[\p{Lu}][\p{L}'’\-]+)?)?)\s*\((19[5-9]\d|20[0-4]\d)[a-z]?\)/gu),
        ];
        if (paren.length) {
          marker = paren.map((m) => m[0]).join(" ");
          refKeys = paren.flatMap((m) => authorYearKeys(m[1]!, references));
        } else if (narrative.length) {
          marker = narrative.map((m) => m[0]).join(" ");
          refKeys = narrative.flatMap((m) => authorYearKeys(`${m[1]} ${m[2]}`, references));
        }
      }
      if (!refKeys.length) continue;
      if (claims.length >= MAX_CLAIMS) {
        truncated = true;
        continue;
      }
      claims.push({ sentence, marker, refKeys: [...new Set(refKeys)], page: pageOf(s) });
    }
    paraStart += para.length + 2;
  }

  // Document text shown in the app: flattened body + the reference list as written.
  const text = hasReferenceList ? `${body.trimEnd()}\n\nReferences\n\n${rawRefs.trim()}` : full;
  return { text, claims, references, hasReferenceList, truncated };
}

const DOMAIN_WORDS: Array<[Domain, RegExp]> = [
  ["Medical", /\b(patient|patients|clinical|trial|randomi[sz]ed|therapy|treatment|disease|diagnos\w*|mortality|dose|placebo|cohort|hospital|medic\w*|cardio\w*|cancer|drug|health)\b/gi],
  ["Legal", /\b(court|statute|plaintiff|defendant|v\.|judgment|jurisdiction|legislation|act|section|law|legal|appeal|tribunal|contract|liability)\b/gi],
  ["Historical", /\b(century|empire|war|dynasty|king|queen|revolution|colonial|archive|historian\w*|medieval|ancient|treaty|reign)\b/gi],
  ["Geological", /\b(rock|sediment\w*|tectonic|mineral\w*|geolog\w*|soil|climate|glacier|volcan\w*|basin|stratigraph\w*|earthquake|groundwater|erosion)\b/gi],
  ["Student assignment", /\b(assignment|essay|student|course|module|lecturer|word count|submitted by|homework)\b/gi],
];

/** Picks the domain whose keywords appear most often in the first 1,000 words. */
export function detectDomainFromText(text: string): Domain {
  const sample = text.split(/\s+/).slice(0, 1000).join(" ");
  let best: Domain = "General research";
  let bestScore = 4; // need a few hits before leaving "General research"
  for (const [domain, re] of DOMAIN_WORDS) {
    const score = sample.match(re)?.length ?? 0;
    if (score > bestScore) {
      best = domain;
      bestScore = score;
    }
  }
  return best;
}
