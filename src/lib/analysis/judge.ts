// Compares a claim with what the cited paper actually says.
//
// Demo mode has no AI model, so this is a transparent rule-based check:
// key-word overlap, numbers, years, negation ("no significant ...") and
// overstated wording ("eliminates", "proves"). The live backend replaces it
// with the full LLM comparison described in BACKEND_CONTRACT.md.

import type { Claim, DateConflict, EvidenceStrength, RetrievalQuality, Verdict } from "../types";
import { STRONG_WORDS } from "../toneCheck";

export interface Passage {
  title: string;
  abstract: string | null;
}

export type Judgement = Pick<
  Claim,
  | "verdict"
  | "evidence_quote"
  | "explanation"
  | "evidence_strength"
  | "retrieval_quality"
  | "uncertainty_note"
  | "date_conflict"
  | "needs_human_review"
  | "suggested_fix"
>;

const STOP = new Set(
  ("a an the of and or in on for to with by from at as is are was were be been being this that these those it its " +
    "their they we our there than then also such which who whom whose has have had can could would should may might " +
    "study studies paper research found shows show showed reported report results data et al").split(" "),
);

const stem = (w: string) =>
  w.length > 5 ? w.replace(/(ations?|ings?|edly|ed|es|s|ly)$/, "") : w.length > 3 ? w.replace(/s$/, "") : w;

function keyWords(s: string): string[] {
  return (s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z][a-z\-]+/g) ?? [])
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);
}

/** Remove citation markers so they aren't mistaken for numbers or names. */
export function stripMarkers(s: string): string {
  return s
    .replace(/\[\d{1,3}(?:\s*[-–,]\s*\d{1,3})*\]/g, "")
    .replace(/\(([^()]*?\b(19|20)\d{2}[a-z]?)\)/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const YEAR = /\b(1[5-9]\d{2}|20[0-4]\d)\b/g;
const years = (s: string) => [...s.matchAll(YEAR)].map((m) => m[1]!);
const numbers = (s: string) =>
  [...s.replace(YEAR, " ").matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(",", "."));

// Negations that apply to a finding ("did not reduce", "no significant effect"),
// not incidental ones like "patients with no prior disease".
const NEG =
  /\b(did not|does not|do not|was not|were not|is not|are not|has not|have not|could not|cannot|failed to|fails to|not significantly|non-?significant|insignificant|not associated|unrelated to|no (?:clear |significant |meaningful |statistically significant |overall )?(?:effect|difference|association|benefit|reduction|improvement|evidence|change|impact|increase|decrease|link|relationship))\b/i;

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

function overlap(claimWords: string[], text: string): number {
  if (!claimWords.length) return 0;
  const set = new Set(keyWords(text));
  return claimWords.filter((w) => set.has(w)).length / claimWords.length;
}

const SOFTEN: Array<[RegExp, string]> = [
  [/\beliminates\b/gi, "reduces"],
  [/\beliminate\b/gi, "reduce"],
  [/\bproves\b/gi, "suggests"],
  [/\bprove\b/gi, "suggest"],
  [/\bguarantees\b/gi, "is associated with"],
  [/\bcures\b/gi, "may help treat"],
  [/\bprevents\b/gi, "may lower the risk of"],
  [/\balways\b/gi, "often"],
  [/\bnever\b/gi, "rarely"],
  [/\bdefinitely\b/gi, "likely"],
  [/\bcertainly\b/gi, "likely"],
  [/\bundoubtedly\b/gi, "likely"],
  [/\bconclusively\b/gi, ""],
  [/\bcompletely\b/gi, "substantially"],
];

const strongIn = (s: string) =>
  STRONG_WORDS.map((w) => w.word).filter((w) => w !== "all" && w !== "every" && new RegExp(`\\b${w}\\b`, "i").test(s));

export function judgeClaim(claimText: string, passage: Passage | null): Judgement {
  const core = stripMarkers(claimText);
  const words = [...new Set(keyWords(core))];

  if (!passage || (!passage.abstract && !passage.title)) {
    return {
      verdict: "not_found",
      evidence_quote: null,
      explanation: "The cited paper could not be retrieved, so the claim could not be compared with it.",
      evidence_strength: "Low",
      retrieval_quality: "Not retrievable",
      uncertainty_note: "Check the reference manually.",
      date_conflict: null,
      needs_human_review: true,
      suggested_fix: null,
    };
  }

  // ---- Title only: we can check the topic, not the details.
  if (!passage.abstract) {
    const t = overlap(words, passage.title);
    const ok = t >= 0.25;
    return {
      verdict: ok ? "partly_supported" : "unsupported",
      evidence_quote: null,
      explanation: ok
        ? `The paper "${passage.title}" is on the same topic, but no abstract was available to check the specific claim.`
        : `The paper "${passage.title}" does not appear to be about what this sentence claims.`,
      evidence_strength: "Low",
      retrieval_quality: "Title only",
      uncertainty_note: "Only the title was available. Open the paper to confirm the details.",
      date_conflict: null,
      needs_human_review: true,
      suggested_fix: null,
    };
  }

  // ---- Abstract available: find the sentence that best matches the claim.
  const sents = sentencesOf(passage.abstract);
  let best = sents[0] ?? passage.abstract;
  let bestScore = -1;
  for (const s of sents) {
    const sc = overlap(words, s);
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  bestScore = Math.max(0, bestScore);
  const topic = overlap(words, `${passage.title} ${passage.abstract}`);

  const claimNums = numbers(core);
  const sourceNums = numbers(passage.abstract);
  const bestNums = numbers(best);
  const missingNums = claimNums.filter((n) => !sourceNums.includes(n));
  const numberMismatch = claimNums.length > 0 && missingNums.length > 0 && sourceNums.length > 0;

  const claimYears = years(core);
  const bestYears = years(best);
  const dateConflict: DateConflict | null =
    claimYears.length === 1 && bestYears.length > 0 && !bestYears.includes(claimYears[0]!) && bestScore >= 0.3
      ? {
          claimed_date: claimYears[0]!,
          actual_date: bestYears[0]!,
          source: `The paper's abstract gives ${bestYears[0]}: "${best.slice(0, 160)}${best.length > 160 ? "…" : ""}"`,
        }
      : null;

  const claimNeg = NEG.test(core);
  const sourceNeg = NEG.test(best);
  const contradiction = claimNeg !== sourceNeg && bestScore >= 0.35;

  const strong = strongIn(core).filter((w) => !new RegExp(`\\b${w}\\b`, "i").test(best));

  let verdict: Verdict;
  let explanation: string;
  if (contradiction) {
    verdict = "contradicted";
    explanation = sourceNeg
      ? "The paper reports no effect or a negative finding, but the sentence states a positive one."
      : "The sentence states a negative finding, but the paper reports a positive one.";
  } else if (bestScore >= 0.5 && !numberMismatch && !dateConflict && !strong.length) {
    verdict = "supported";
    explanation = "The paper's abstract states the same finding as this sentence.";
  } else if (bestScore >= 0.3 || topic >= 0.45) {
    verdict = "partly_supported";
    const why: string[] = [];
    if (numberMismatch) why.push(`the figure${missingNums.length > 1 ? "s" : ""} ${missingNums.join(", ")} ${missingNums.length > 1 ? "do" : "does"} not appear in the paper`);
    if (dateConflict) why.push(`the paper gives ${dateConflict.actual_date}, not ${dateConflict.claimed_date}`);
    if (strong.length) why.push(`the sentence uses stronger wording ("${strong.join('", "')}") than the paper`);
    if (!why.length) why.push("only part of the sentence matches what the paper reports");
    explanation = `The paper covers this topic, but ${why.join("; ")}.`;
  } else {
    verdict = "unsupported";
    explanation = "The paper's abstract does not mention what this sentence claims.";
  }

  // ---- Suggested fix: only when we can make a safe, specific correction.
  let fix: string | null = null;
  if (verdict === "partly_supported") {
    let f = claimText;
    if (dateConflict) f = f.replace(dateConflict.claimed_date, dateConflict.actual_date);
    const bestOnly = bestNums.filter((n) => !claimNums.includes(n));
    if (numberMismatch && missingNums.length === 1 && bestOnly.length === 1) {
      f = f.replace(new RegExp(`\\b${missingNums[0]!.replace(".", "[.,]")}\\b`), bestOnly[0]!);
    }
    for (const [re, to] of SOFTEN) f = f.replace(re, to);
    f = f.replace(/\s{2,}/g, " ");
    if (f !== claimText) fix = f;
  }

  const strength: EvidenceStrength = bestScore >= 0.65 ? "High" : bestScore >= 0.4 ? "Medium" : "Low";
  const retrieval: RetrievalQuality = "Abstract only";
  return {
    verdict,
    evidence_quote: best.length > 420 ? `${best.slice(0, 417)}…` : best,
    explanation,
    evidence_strength: verdict === "unsupported" ? "Low" : strength,
    retrieval_quality: retrieval,
    uncertainty_note:
      "Compared with the paper's abstract using key words, numbers and wording. The full text may contain more detail.",
    date_conflict: dateConflict,
    needs_human_review: verdict === "contradicted" || verdict === "unsupported",
    suggested_fix: fix,
  };
}
