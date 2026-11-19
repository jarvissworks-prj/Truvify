/**
 * Tone Check - Detects overstatements and mismatch in certainty between claims and sources.
 *
 * Examples:
 * 1. Claim: "Omega-3 supplementation eliminates the risk of sudden cardiac death [5]."
 *    Source: "Omega-3 supplementation was associated with no significant reduction."
 *    Result: { level: "warn", strongWords: ["eliminates"], message: "Stronger wording than the source. The claim says 'eliminates', but the source says 'associated with'." }
 *
 * 2. Claim: "Aspirin reduces heart attack risk in all adults [1]."
 *    Source: "Daily low-dose aspirin reduced recurrence by 22% in patients with prior events."
 *    Result: { level: "warn", strongWords: ["all"], message: "Stronger wording than the source. The claim says 'all', but the source says 'recurrence by 22%'." }
 *
 * 3. Claim: "Regular aerobic exercise may lower systolic blood pressure [4]."
 *    Source: "Findings indicate regular exercise may potentially lower blood pressure."
 *    Result: { level: "ok", strongWords: [], message: "" }
 */

export interface StrongWordMeta {
  word: string;
  meaning: string;
}

export const STRONG_WORDS: StrongWordMeta[] = [
  { word: "proves", meaning: "Claims definitive causation rather than correlation or empirical support" },
  { word: "eliminates", meaning: "Asserts 100% removal or eradication of risk or condition" },
  { word: "always", meaning: "Expresses unconditional universality without exception" },
  { word: "never", meaning: "Expresses absolute impossibility or complete absence" },
  { word: "guarantees", meaning: "Assures deterministic certainty of an outcome" },
  { word: "definitely", meaning: "Indicates certainty without qualification" },
  { word: "cures", meaning: "Claims total therapeutic resolution of a disease" },
  { word: "prevents", meaning: "Asserts complete avoidance of an outcome or occurrence" },
  { word: "completely", meaning: "Denotes totality or absence of limitation" },
  { word: "all", meaning: "Universal quantifier claiming applicability to entire populations" },
  { word: "every", meaning: "Exhaustive quantifier claiming no exceptions exist" },
  { word: "certainly", meaning: "Expresses unwavering epistemic certainty" },
  { word: "undoubtedly", meaning: "Denies any doubt or room for uncertainty" },
  { word: "conclusively", meaning: "Claims final, unquestionable proof" },
];

export const SOFT_WORDS: string[] = [
  "suggests",
  "suggest",
  "suggested",
  "may",
  "might",
  "associated with",
  "associated",
  "linked to",
  "linked",
  "appears",
  "appear",
  "appeared",
  "potentially",
  "potential",
  "correlated",
  "correlates",
  "correlation",
];

export interface ToneCheckResult {
  level: "ok" | "warn";
  strongWords: string[];
  message: string;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findMatches(text: string, phrases: string[]): string[] {
  const matches: string[] = [];
  for (const phrase of phrases) {
    const escaped = escapeRegex(phrase).replace(/\\\s\+/g, "\\s+");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    if (pattern.test(text)) {
      matches.push(phrase);
    }
  }
  return matches;
}

export function checkTone(claimText: string, evidenceQuote: string | null): ToneCheckResult {
  if (!evidenceQuote || !evidenceQuote.trim()) {
    return { level: "ok", strongWords: [], message: "" };
  }

  const strongWordsList = STRONG_WORDS.map((w) => w.word);
  const foundStrongInClaim = findMatches(claimText, strongWordsList);

  if (foundStrongInClaim.length === 0) {
    return { level: "ok", strongWords: [], message: "" };
  }

  const foundSoftInSource = findMatches(evidenceQuote, SOFT_WORDS);
  const foundStrongInSource = findMatches(evidenceQuote, strongWordsList);

  // Rule: if the claim contains a strong word AND the evidence quote contains a soft word (or no strong word), level is "warn".
  if (foundSoftInSource.length > 0) {
    const claimWordStr = foundStrongInClaim.map((w) => `'${w}'`).join(", ");
    const sourceWordStr = foundSoftInSource.map((w) => `'${w}'`).join(", ");
    return {
      level: "warn",
      strongWords: foundStrongInClaim,
      message: `Stronger wording than the source. The claim says ${claimWordStr}, but the source says ${sourceWordStr}.`,
    };
  }

  if (foundStrongInSource.length === 0) {
    const claimWordStr = foundStrongInClaim.map((w) => `'${w}'`).join(", ");
    return {
      level: "warn",
      strongWords: foundStrongInClaim,
      message: `Stronger wording than the source. The claim says ${claimWordStr}, but the source does not use conclusive wording.`,
    };
  }

  return { level: "ok", strongWords: [], message: "" };
}
