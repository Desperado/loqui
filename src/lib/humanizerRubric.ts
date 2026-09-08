/**
 * Editorial guidance adapted from Humanizer v3.0.0.
 * Upstream: https://github.com/blader/humanizer/tree/9862685f575c65a8247f90369951df1b3416e3d6
 * Licensed under the MIT License. See THIRD_PARTY_NOTICES.md.
 */

export const HUMANIZER_UPSTREAM = {
  version: "3.0.0",
  commit: "9862685f575c65a8247f90369951df1b3416e3d6",
} as const;

export const MAX_WRITING_SAMPLE_CHARACTERS = 6_000;

/**
 * A compact version of the upstream 25-pattern rubric. The detailed upstream
 * prompt is deliberately not embedded in every provider request.
 */
export const HUMANIZER_EDITORIAL_RUBRIC = [
  "Editorial pass:",
  "- State the point directly. Remove empty not-X-but-Y contrasts, repeated dramatic closers, fake profundity, staged introductions, and objections nobody raised.",
  "- Let meaning set the rhythm. Avoid forced groups of three, repeated sentence openings, dashes used for every connection, stacked qualifiers, unnecessary hyphenated pairs, and passive constructions that hide a useful subject.",
  "- Keep claims proportional. Replace stock AI vocabulary with plain words; remove inflated significance, vague associations, unsupported -ing commentary, sales copy, borrowed authority, and elaborate substitutes for is, are, or has.",
  "- Let formatting carry information. Remove decorative bold labels, decorative headings or emoji, and quotation-mark styling that conflicts with the writer's sample.",
  "- Remove draft residue: chatbot greetings and offers, knowledge-cutoff disclaimers or guesses, headings repeated by their first sentence, and commentary about an obsolete version outside change-oriented documents.",
  "- Preserve intentional contrasts, real three-item lists, quotations, technical terminology, necessary hyphenation, and deliberate repetition. A single weak signal is not enough to rewrite a sound sentence.",
  "- Keep specific details, mixed feelings, humor, asides, and other choices that make the writer recognizable.",
].join("\n");

export type EditorialViolationId =
  | "not_x_but_y"
  | "dramatic_closer"
  | "excessive_dashes"
  | "forced_triad"
  | "decorative_bold";

export interface EditorialViolation {
  id: EditorialViolationId;
  message: string;
}

export interface EditorialReviewInput {
  text: string;
  language?: string;
  writingSample?: string;
}

const ENGLISH_NOT_X_BUT_Y = [
  /\bnot (?:just|only|merely)\b[^.!?\n]{0,120}\bbut\b/iu,
  /\b(?:it|this|that)(?:'s| is) not\b[^.!?\n]{0,100}[,;:]\s*(?:it|this|that)(?:'s| is)\b/iu,
  /\bthis (?:does not|doesn't) mean\b[^.!?]*[.!?]\s*it means\b/iu,
];

const ENGLISH_DRAMATIC_CLOSERS = [
  /\bthat is the real (?:win|point|question)\b/iu,
  /\bread that again\b/iu,
  /\blet that sink in\b/iu,
  /\bthis changes everything\b/iu,
];

const ABSTRACT_TRIAD_WORDS = [
  "clarity",
  "confidence",
  "control",
  "efficiency",
  "excellence",
  "growth",
  "impact",
  "innovation",
  "insight",
  "insights",
  "inspiration",
  "scale",
  "success",
  "transformation",
  "value",
];

function languageRoot(language?: string): string | undefined {
  return language?.trim().toLowerCase().split("-")[0] || undefined;
}

function maskExemptContent(text: string): string {
  return text
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`[^`\n]*`/gu, " ")
    .replace(/https?:\/\/[^\s<>"']+/giu, " ")
    .replace(/“[^”\n]*”/gu, " ")
    .replace(/‘[^’\n]*’/gu, " ")
    .replace(/"[^"\n]*"/gu, " ")
    .replace(/^\s*>.*$/gmu, " ");
}

function dashCount(text: string): number {
  return text.match(/—|–|\s--\s/gu)?.length ?? 0;
}

function excessiveDashes(text: string, writingSample?: string): boolean {
  const count = dashCount(text);
  if (count < 2) return false;
  if (!writingSample?.trim()) return true;

  const sample = maskExemptContent(writingSample);
  const sampleRate = dashCount(sample) / Math.max(Array.from(sample).length, 1);
  const expected = sampleRate * Array.from(text).length;
  return count > Math.max(2, Math.ceil(expected) + 1);
}

function hasAbstractTriad(text: string): boolean {
  const words = ABSTRACT_TRIAD_WORDS.join("|");
  return new RegExp(`\\b(?:${words}),\\s+(?:${words}),\\s+(?:and|&)\\s+(?:${words})\\b`, "iu").test(text);
}

/**
 * Conservative checks for the five patterns that most often survive a first
 * rewrite. English lexical checks only run when the caller identifies English;
 * structural checks remain language-neutral.
 */
export function reviewEditorialPatterns(input: EditorialReviewInput): EditorialViolation[] {
  const prose = maskExemptContent(input.text);
  const violations: EditorialViolation[] = [];

  if (languageRoot(input.language) === "en") {
    if (ENGLISH_NOT_X_BUT_Y.some((pattern) => pattern.test(prose))) {
      violations.push({ id: "not_x_but_y", message: "State the point without an empty not-X-but-Y contrast." });
    }
    if (ENGLISH_DRAMATIC_CLOSERS.some((pattern) => pattern.test(prose)) || /(?:^|[.!?]\s+)No [\p{L}\p{N}'’-]+\.\s+No [\p{L}\p{N}'’-]+\.\s+No [\p{L}\p{N}'’-]+\./iu.test(prose)) {
      violations.push({ id: "dramatic_closer", message: "Remove the repeated dramatic closer or merge fragments into a specific claim." });
    }
    if (hasAbstractTriad(prose)) {
      violations.push({ id: "forced_triad", message: "Use only the list items the meaning requires instead of a stock abstract triad." });
    }
  }

  if (excessiveDashes(prose, input.writingSample)) {
    violations.push({ id: "excessive_dashes", message: "Use periods, commas, colons, or parentheses instead of repeated dashes." });
  }

  if ((prose.match(/(?:^|\n)\s*[-*]?\s*\*\*[^*\n:]{1,60}:\*\*/gu)?.length ?? 0) >= 2) {
    violations.push({ id: "decorative_bold", message: "Remove repeated decorative bold labels or turn the labeled list into natural prose." });
  }

  return violations;
}
