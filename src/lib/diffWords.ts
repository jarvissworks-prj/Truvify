/**
 * DiffWords - Word-by-word comparison for claim vs source evidence text.
 *
 * Unit Check 1:
 * Claim: "Daily low-dose aspirin reduces the risk of heart attack by 40% in all adults."
 * Source: "In 4,500 patients with prior cardiovascular events, daily low-dose aspirin reduced recurrence by 22% compared with placebo."
 * -> Numbers '40%' and '22%' (as well as '4,500') mismatch -> highlighted red (diff-number).
 * -> Words 'heart', 'attack', 'all', 'adults' only in claim -> highlighted amber (diff-claim).
 * -> Words 'patients', 'prior', 'cardiovascular', 'events', 'recurrence', 'placebo' only in source -> highlighted emerald (diff-source).
 *
 * Unit Check 2:
 * Claim: "The landmark Framingham Heart Study began enrolling participants in 1952."
 * Source: "Enrolment of the original cohort began in 1948 in Framingham, Massachusetts."
 * -> '1952' and '1948' mismatch -> highlighted red (diff-number).
 * -> 'began', 'Framingham', etc. appear in both -> normal text.
 */

export type DiffTokenKind = "same" | "diff-claim" | "diff-source" | "diff-number" | "punct";

export interface DiffToken {
  text: string;
  kind: DiffTokenKind;
}

export interface DiffResult {
  claimTokens: DiffToken[];
  sourceTokens: DiffToken[];
}

function normalizeNumber(s: string): string {
  return s.replace(/[^\d]/g, "");
}

function cleanWord(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenize(text: string): string[] {
  // Matches numbers with optional commas/decimals/percent, or words, or punctuation/spaces
  return text.match(/\d+(?:[.,]\d+)*%?|[a-zA-Z]+(?:'[a-zA-Z]+)?|\s+|[^\s\w]/g) || [];
}

export function removeCitationMarkers(s: string): string {
  return s
    .replace(/\[\d+\]/g, "")
    .replace(/\(\d{4}\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function diffWords(claimText: string, sourceText: string): DiffResult {
  const cleanClaim = removeCitationMarkers(claimText);
  const cleanSource = removeCitationMarkers(sourceText);

  const rawClaimTokens = tokenize(cleanClaim);
  const rawSourceTokens = tokenize(cleanSource);

  // Collect numbers
  const claimNums = new Set<string>();
  for (const t of rawClaimTokens) {
    if (/\d/.test(t)) {
      const n = normalizeNumber(t);
      if (n) claimNums.add(n);
    }
  }

  const sourceNums = new Set<string>();
  for (const t of rawSourceTokens) {
    if (/\d/.test(t)) {
      const n = normalizeNumber(t);
      if (n) sourceNums.add(n);
    }
  }

  // Collect words (ignoring case and punctuation)
  const claimWords = new Set<string>();
  for (const t of rawClaimTokens) {
    if (/[a-zA-Z]/.test(t)) {
      const w = cleanWord(t);
      if (w) claimWords.add(w);
    }
  }

  const sourceWords = new Set<string>();
  for (const t of rawSourceTokens) {
    if (/[a-zA-Z]/.test(t)) {
      const w = cleanWord(t);
      if (w) sourceWords.add(w);
    }
  }

  // Classify claim tokens
  const claimTokens: DiffToken[] = rawClaimTokens.map((t) => {
    if (/^\s+$/.test(t) || !/[a-zA-Z0-9]/.test(t)) {
      return { text: t, kind: "punct" };
    }
    if (/\d/.test(t)) {
      const num = normalizeNumber(t);
      const matches = sourceNums.has(num);
      return { text: t, kind: matches ? "same" : "diff-number" };
    }
    const w = cleanWord(t);
    const matches = sourceWords.has(w);
    return { text: t, kind: matches ? "same" : "diff-claim" };
  });

  // Classify source tokens
  const sourceTokens: DiffToken[] = rawSourceTokens.map((t) => {
    if (/^\s+$/.test(t) || !/[a-zA-Z0-9]/.test(t)) {
      return { text: t, kind: "punct" };
    }
    if (/\d/.test(t)) {
      const num = normalizeNumber(t);
      const matches = claimNums.has(num);
      return { text: t, kind: matches ? "same" : "diff-number" };
    }
    const w = cleanWord(t);
    const matches = claimWords.has(w);
    return { text: t, kind: matches ? "same" : "diff-source" };
  });

  return { claimTokens, sourceTokens };
}
