// Looks references up in real scholarly databases, straight from the browser.
// Crossref (https://api.crossref.org) and OpenAlex (https://api.openalex.org)
// are free, need no API key, and allow cross-origin requests.

import { cleanDoi } from "./citations";

export interface SourceUpdate {
  type: "retracted" | "corrected" | "updated";
  label: string;
  year: number | null;
}

export interface PaperInfo {
  title: string;
  year: number | null;
  doi: string | null;
  journal: string | null;
  authors: string[];
  abstract: string | null;
  database: "Crossref" | "OpenAlex";
  updates: SourceUpdate[];
}

export class NetworkError extends Error {}

const TIMEOUT_MS = 15_000;

async function getJson(url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
  } catch {
    throw new NetworkError("Could not reach the citation databases.");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) return null;
  if (res.status === 429) {
    // Rate limited: wait a moment and try once more.
    await new Promise((r) => setTimeout(r, 1500));
    const again = await fetch(url, { headers: { Accept: "application/json" } }).catch(() => null);
    if (!again || !again.ok) return null;
    try {
      return await again.json();
    } catch {
      return null;
    }
  }
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function fromCrossref(m: any): PaperInfo {
  const year =
    m?.issued?.["date-parts"]?.[0]?.[0] ??
    m?.["published-print"]?.["date-parts"]?.[0]?.[0] ??
    m?.["published-online"]?.["date-parts"]?.[0]?.[0] ??
    null;
  const updates: SourceUpdate[] = [];
  for (const u of m?.["updated-by"] ?? []) {
    const t = String(u?.type ?? "").toLowerCase();
    const y = u?.updated?.["date-parts"]?.[0]?.[0] ?? null;
    if (t.includes("retract") || t.includes("withdraw")) updates.push({ type: "retracted", label: "retracted", year: y });
    else if (t.includes("correct") || t.includes("erratum")) updates.push({ type: "corrected", label: "corrected", year: y });
    else if (t) updates.push({ type: "updated", label: t.replace(/_/g, " "), year: y });
  }
  if (/^retract(ed|ion)/i.test(m?.title?.[0] ?? "")) updates.push({ type: "retracted", label: "retracted", year });
  return {
    title: stripTags(m?.title?.[0] ?? ""),
    year: typeof year === "number" ? year : null,
    doi: cleanDoi(m?.DOI ?? null),
    journal: m?.["container-title"]?.[0] ?? null,
    authors: (m?.author ?? []).map((a: any) => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean),
    abstract: m?.abstract ? stripTags(String(m.abstract)).replace(/^abstract\s*/i, "") : null,
    database: "Crossref",
    updates,
  };
}

function invertedToText(idx: Record<string, number[]> | null | undefined): string | null {
  if (!idx) return null;
  const words: string[] = [];
  for (const [w, positions] of Object.entries(idx)) for (const p of positions) words[p] = w;
  const text = words.filter(Boolean).join(" ").trim();
  return text || null;
}

function fromOpenAlex(w: any): PaperInfo {
  const updates: SourceUpdate[] = w?.is_retracted ? [{ type: "retracted", label: "retracted", year: null }] : [];
  return {
    title: stripTags(w?.title ?? w?.display_name ?? ""),
    year: w?.publication_year ?? null,
    doi: cleanDoi(w?.doi ?? null),
    journal: w?.primary_location?.source?.display_name ?? null,
    authors: (w?.authorships ?? []).map((a: any) => a?.author?.display_name).filter(Boolean),
    abstract: invertedToText(w?.abstract_inverted_index),
    database: "OpenAlex",
    updates,
  };
}

const STOP = new Set(
  "a an the of and or in on for to with by from at as is are was were be been this that these those its it their we our using use via into over under between among".split(" "),
);
export const contentWords = (s: string) =>
  (s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g) ?? []).filter(
    (w) => w.length > 2 && !STOP.has(w),
  );

/** How much of a found paper's title appears in the reference text (0–1). */
export function titleMatch(title: string, referenceText: string): number {
  const t = contentWords(title);
  if (!t.length) return 0;
  const ref = new Set(contentWords(referenceText));
  return t.filter((w) => ref.has(w)).length / t.length;
}

const cache = new Map<string, Promise<PaperInfo | null>>();
const memo = (key: string, fn: () => Promise<PaperInfo | null>) => {
  let p = cache.get(key);
  if (!p) {
    p = fn();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
};

export function lookupDoi(doi: string): Promise<PaperInfo | null> {
  return memo(`doi:${doi.toLowerCase()}`, async () => {
    const cr = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    if (cr?.message) {
      const paper = fromCrossref(cr.message);
      if (!paper.abstract || !paper.updates.length) {
        // OpenAlex often has the abstract (and a retraction flag) when Crossref doesn't.
        const oa = await getJson(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`).catch(() => null);
        if (oa) {
          const extra = fromOpenAlex(oa);
          paper.abstract ??= extra.abstract;
          if (!paper.updates.length) paper.updates = extra.updates;
        }
      }
      return paper;
    }
    const oa = await getJson(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`);
    return oa ? fromOpenAlex(oa) : null;
  });
}

/** Searches by the full reference text; only accepts a result whose title clearly matches. */
export function searchReference(referenceText: string): Promise<PaperInfo | null> {
  const q = referenceText.replace(/\s+/g, " ").slice(0, 300);
  return memo(`q:${q}`, async () => {
    const cr = await getJson(`https://api.crossref.org/works?rows=5&query.bibliographic=${encodeURIComponent(q)}`);
    const items: any[] = cr?.message?.items ?? [];
    let best: PaperInfo | null = null;
    let bestScore = 0;
    for (const it of items) {
      const p = fromCrossref(it);
      const s = titleMatch(p.title, q);
      if (s > bestScore) {
        best = p;
        bestScore = s;
      }
    }
    if (best && bestScore >= 0.75) {
      if (best.doi) return (await lookupDoi(best.doi)) ?? best;
      return best;
    }
    const oa = await getJson(`https://api.openalex.org/works?per_page=5&search=${encodeURIComponent(q.slice(0, 200))}`);
    for (const w of oa?.results ?? []) {
      const p = fromOpenAlex(w);
      if (titleMatch(p.title, q) >= 0.75) return p;
    }
    return null;
  });
}

/** Finds a more recent, well-cited paper on the same topic. */
export async function findNewerPaper(paper: PaperInfo): Promise<PaperInfo | null> {
  if (!paper.year) return null;
  const topic = contentWords(paper.title).slice(0, 8).join(" ");
  if (!topic) return null;
  const json = await getJson(
    `https://api.openalex.org/works?per_page=5&sort=cited_by_count:desc&search=${encodeURIComponent(topic)}&filter=from_publication_date:${paper.year + 2}-01-01`,
  ).catch(() => null);
  for (const w of json?.results ?? []) {
    const p = fromOpenAlex(w);
    if (p.title && p.doi !== paper.doi && titleMatch(p.title, paper.title) >= 0.35) return p;
  }
  return null;
}
