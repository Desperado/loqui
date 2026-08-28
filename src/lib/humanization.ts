import { z } from "zod";
import { getModel, isModelEnabled } from "./models";
import { completeChat, type ChatMessage, type ChatOptions } from "./translate";

export const MAX_INPUT_CHARACTERS = 12_000;
export const MAX_BATCH_SIZE = 50;

export const toneSchema = z.enum(["conversational", "crisp", "warm", "polished"]);
export const avoidSchema = z.enum(["em_dash", "double_dash", "cliches", "salesy_language"]);

export const humanizeRequestSchema = z
  .object({
    text: z.string().max(MAX_INPUT_CHARACTERS),
    tone: toneSchema,
    max_characters: z.number().int().min(1).max(MAX_INPUT_CHARACTERS),
    recipient_name: z.string().trim().min(1).max(200).optional(),
    recipient_context: z.string().trim().min(1).max(2_000).optional(),
    preserve_terms: z.array(z.string().min(1).max(200)).max(50).default([]),
    avoid: z.array(avoidSchema).max(4).default([]),
    language: z
      .string()
      .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, "Use a BCP 47-style language code")
      .optional(),
  })
  .strict();

export const humanizeOutputSchema = z.object({
  humanized_text: z.string(),
  character_count: z.number().int().nonnegative(),
  within_limit: z.boolean(),
  preserved_terms: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const validationRequestSchema = z
  .object({
    original_text: z.string().max(MAX_INPUT_CHARACTERS),
    rewritten_text: z.string().max(MAX_INPUT_CHARACTERS),
    preserve_terms: z.array(z.string().min(1).max(200)).max(50).default([]),
  })
  .strict();

const exactCheckSchema = z.object({
  preserved: z.boolean(),
  original: z.array(z.string()),
  missing: z.array(z.string()),
  added: z.array(z.string()),
});

const semanticCheckSchema = z.object({
  preserved: z.boolean(),
  original: z.string(),
  rewritten: z.string(),
  concerns: z.array(z.string()),
});

export const validationOutputSchema = z.object({
  valid: z.boolean(),
  checks: z.object({
    names: exactCheckSchema,
    companies: exactCheckSchema,
    numbers: exactCheckSchema,
    links: exactCheckSchema,
    claims: semanticCheckSchema,
    intent: semanticCheckSchema,
    required_terms: exactCheckSchema,
  }),
  warnings: z.array(z.string()),
});

export type HumanizeRequest = z.infer<typeof humanizeRequestSchema>;
export type HumanizeOutput = z.infer<typeof humanizeOutputSchema>;
export type ValidationRequest = z.infer<typeof validationRequestSchema>;
export type ValidationReport = z.infer<typeof validationOutputSchema>;

export type HumanizationErrorCode =
  | "INVALID_INPUT"
  | "NO_PROVIDER"
  | "PROVIDER_UNAVAILABLE"
  | "LENGTH_LIMIT_UNSATISFIED"
  | "PRESERVATION_FAILED"
  | "RESTRICTION_CONFLICT"
  | "INTERNAL_ERROR";

export interface PublicHumanizationError {
  code: HumanizationErrorCode;
  message: string;
  retryable: boolean;
}

export class HumanizationError extends Error {
  constructor(
    readonly code: HumanizationErrorCode,
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "HumanizationError";
  }
}

export function publicHumanizationError(error: unknown): PublicHumanizationError {
  if (error instanceof HumanizationError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "The humanization request could not be completed.",
    retryable: false,
  };
}

type ExactCheck = z.infer<typeof exactCheckSchema>;
type Completion = (modelId: string, messages: ChatMessage[], options?: ChatOptions) => Promise<string>;

export interface HumanizationEngineDependencies {
  complete?: Completion;
  availableModels?: () => string[];
}

export interface HumanizeOptions {
  preferredModel?: string;
  signal?: AbortSignal;
}

const HUMANIZATION_MODEL_ORDER = [
  "groq/llama-3.3-70b-versatile",
  "cerebras/gpt-oss-120b",
  "groq/llama-3.1-8b-instant",
  "cerebras/gemma-4-31b",
];

const PROPER_WORD = /(?<![\p{L}\p{N}_])(?:\p{Lu}[\p{L}\p{M}'’.-]*|[A-Z]{2,}[A-Z0-9&.-]*)(?![\p{L}\p{N}_])/gu;
const COMPANY_SUFFIX = /(?:corp(?:oration)?|company|inc|llc|ltd|limited|gmbh|ag|plc|labs?|systems?|technologies|foundation)\.?$/i;
const SENTENCE_STARTERS = new Set([
  "A", "An", "And", "As", "At", "Because", "Before", "But", "Can", "Could", "Dear", "For", "From",
  "Hello", "Hi", "I", "If", "In", "It", "My", "No", "On", "Our", "Please", "She", "Thanks", "That",
  "The", "They", "This", "To", "Today", "Tomorrow", "We", "When", "While", "Would", "You", "Your",
]);
const NEGATION = /\b(?:no|not|never|neither|nor|without|cannot|can't|won't|isn't|aren't|didn't|doesn't|don't)\b/giu;
const UNCERTAINTY = /\b(?:may|might|could|possibly|probably|approximately|about)\b/giu;
const COMMITMENT = /\b(?:will|must|guarantee[ds]?|promise[ds]?)\b/giu;
const INVENTED_CLAIMS = [
  /\btrusted by\b/iu,
  /\bour customers?\b/iu,
  /\b(?:raised|secured) (?:funding|investment|capital)\b/iu,
  /\b(?:venture|investor)[ -]?backed\b/iu,
  /\b(?:certified|award-winning|industry-leading)\b/iu,
  /\byears? of (?:experience|expertise)\b/iu,
];
const CLICHES = [
  /\bat the end of the day\b/iu,
  /\bgame[ -]?changer\b/iu,
  /\bthink outside the box\b/iu,
  /\bin today's fast-paced world\b/iu,
  /\bunlock (?:the |your )?(?:power|potential)\b/iu,
];
const SALESY = [
  /\bact now\b/iu,
  /\blimited[ -]?time offer\b/iu,
  /\bdon't miss out\b/iu,
  /\brevolutionary\b/iu,
  /\bunparalleled\b/iu,
];

export function characterCount(value: string): number {
  return Array.from(value).length;
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

function extractUrls(text: string): string[] {
  return unique(
    (text.match(/https?:\/\/[^\s<>"']+/giu) ?? []).map((url) => {
      let cleaned = url.replace(/[.,;:!?]$/u, "");
      if (cleaned.endsWith(")") && !cleaned.includes("(")) cleaned = cleaned.slice(0, -1);
      return cleaned;
    })
  );
}

function extractNumbers(text: string): string[] {
  return unique(text.match(/(?<![\p{L}\p{N}])(?:[$€£¥]\s*)?\d[\d,.'’]*(?:%|\b)/gu) ?? []);
}

interface ProperEntity {
  value: string;
  index: number;
}

function extractProperEntities(text: string): ProperEntity[] {
  const matches = [...text.matchAll(PROPER_WORD)].map((match) => ({
    value: match[0],
    index: match.index,
    end: match.index + match[0].length,
  }));
  const combined: ProperEntity[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const group = [matches[index]];
    let end = matches[index].end;
    while (matches[index + 1] && /^\s+$/u.test(text.slice(end, matches[index + 1].index))) {
      index += 1;
      group.push(matches[index]);
      end = matches[index].end;
    }

    const atSentenceStart = group[0].index === 0 || /[.!?]\s*$/u.test(text.slice(0, group[0].index));
    if (atSentenceStart && group.length > 1 && SENTENCE_STARTERS.has(group[0].value)) group.shift();
    const first = group[0];
    const value = text.slice(first.index, group.at(-1)!.end);
    const distinctiveSingle = /[A-Z].*[A-Z]/u.test(value) || /^[A-Z]{2,}/u.test(value);
    if (value.includes(" ") || distinctiveSingle || !atSentenceStart || !SENTENCE_STARTERS.has(value)) {
      combined.push({ value, index: first.index });
    }
  }
  return combined;
}

function extractCompanies(text: string): string[] {
  return unique(
    extractProperEntities(text)
      .map(({ value }) => value)
      .filter((value) => COMPANY_SUFFIX.test(value) || /[a-z][A-Z]/u.test(value) || /^[A-Z]{2,}[A-Z0-9&.-]*$/u.test(value))
  );
}

function extractNames(text: string): string[] {
  const companies = new Set(extractCompanies(text));
  return unique(extractProperEntities(text).map(({ value }) => value).filter((value) => !companies.has(value)));
}

function exactCheck(original: string[], rewritten: string[]): ExactCheck {
  const rewrittenSet = new Set(rewritten);
  const originalSet = new Set(original);
  const missing = original.filter((value) => !rewrittenSet.has(value));
  const added = rewritten.filter((value) => !originalSet.has(value));
  return { preserved: missing.length === 0, original, missing, added };
}

function requiredTermsCheck(terms: string[], rewritten: string): ExactCheck {
  const original = unique(terms);
  const missing = original.filter((term) => !rewritten.includes(term));
  return { preserved: missing.length === 0, original, missing, added: [] };
}

function markerCount(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function classifyIntent(text: string): string {
  const trimmed = text.trim();
  if (/\?\s*$/u.test(trimmed) || /^(?:who|what|when|where|why|how|can|could|would|will|is|are|do|does|did)\b/iu.test(trimmed)) {
    return "question";
  }
  if (/\b(?:please|can you|could you|would you|i need you to|kindly)\b/iu.test(trimmed)) return "request";
  if (/\b(?:i|we) (?:will|promise|commit)\b/iu.test(trimmed)) return "commitment";
  return "statement";
}

function introducedClaimMarkers(original: string, rewritten: string): string[] {
  return INVENTED_CLAIMS.filter((pattern) => pattern.test(rewritten) && !pattern.test(original)).map(
    () => "The rewrite introduced a credential, relationship, traction, or funding-style claim."
  );
}

export function validateHumanization(input: ValidationRequest): ValidationReport {
  const parsed = validationRequestSchema.safeParse(input);
  if (!parsed.success) throw new HumanizationError("INVALID_INPUT", "Validation input is invalid.");

  const { original_text: original, rewritten_text: rewritten, preserve_terms: terms } = parsed.data;
  const names = exactCheck(extractNames(original), extractNames(rewritten));
  const companies = exactCheck(extractCompanies(original), extractCompanies(rewritten));
  const numbers = exactCheck(extractNumbers(original), extractNumbers(rewritten));
  const links = exactCheck(extractUrls(original), extractUrls(rewritten));
  const requiredTerms = requiredTermsCheck(terms, rewritten);

  const claimConcerns: string[] = [];
  if (!numbers.preserved) claimConcerns.push("One or more numeric facts changed or disappeared.");
  if (!links.preserved) claimConcerns.push("One or more links changed or disappeared.");
  if (!names.preserved || !companies.preserved) claimConcerns.push("A named entity changed or disappeared.");
  if (numbers.added.length || links.added.length || names.added.length || companies.added.length) {
    claimConcerns.push("The rewrite introduced a new named or numeric fact.");
  }
  if (markerCount(original, NEGATION) !== markerCount(rewritten, NEGATION)) {
    claimConcerns.push("Negation changed, which may reverse a claim.");
  }
  if (markerCount(original, UNCERTAINTY) !== markerCount(rewritten, UNCERTAINTY)) {
    claimConcerns.push("Certainty changed, which may strengthen or weaken a claim.");
  }
  if (markerCount(original, COMMITMENT) !== markerCount(rewritten, COMMITMENT)) {
    claimConcerns.push("A commitment or guarantee changed.");
  }
  claimConcerns.push(...introducedClaimMarkers(original, rewritten));

  const originalIntent = classifyIntent(original);
  const rewrittenIntent = classifyIntent(rewritten);
  const intentConcerns = originalIntent === rewrittenIntent ? [] : [`Intent changed from ${originalIntent} to ${rewrittenIntent}.`];
  const claims = {
    preserved: claimConcerns.length === 0,
    original: "Protected factual entities, polarity, certainty, and commitments",
    rewritten: claimConcerns.length ? "Potential factual change detected" : "No protected factual change detected",
    concerns: unique(claimConcerns),
  };
  const intent = {
    preserved: intentConcerns.length === 0,
    original: originalIntent,
    rewritten: rewrittenIntent,
    concerns: intentConcerns,
  };
  const checks = { names, companies, numbers, links, claims, intent, required_terms: requiredTerms };

  return {
    valid: Object.values(checks).every((check) => check.preserved),
    checks,
    warnings: [
      "Claims and intent are checked conservatively using protected entities, polarity, certainty, commitments, and request shape; nuanced semantic changes still require human review.",
    ],
  };
}

function defaultAvailableModels(): string[] {
  const configured = process.env.LOQUI_HUMANIZE_MODEL;
  return unique([configured, ...HUMANIZATION_MODEL_ORDER].filter((id): id is string => Boolean(id))).filter((id) => {
    const spec = getModel(id);
    return Boolean(spec && (spec.provider === "groq" || spec.provider === "cerebras") && isModelEnabled(spec));
  });
}

function normalizeRequest(input: HumanizeRequest): HumanizeRequest {
  const parsed = humanizeRequestSchema.safeParse(input);
  if (!parsed.success) throw new HumanizationError("INVALID_INPUT", "The humanization request is invalid.");
  const text = parsed.data.text.trim();
  if (!text) throw new HumanizationError("INVALID_INPUT", "Text must not be empty.");
  const preserveTerms = unique(parsed.data.preserve_terms);
  const missingTerms = preserveTerms.filter((term) => !text.includes(term));
  if (missingTerms.length) {
    throw new HumanizationError("INVALID_INPUT", "Every preserve_terms value must occur exactly in text.");
  }

  const protectedValues = unique([
    ...preserveTerms,
    ...extractNames(text),
    ...extractCompanies(text),
    ...extractNumbers(text),
    ...extractUrls(text),
  ]);
  if (parsed.data.avoid.includes("em_dash") && protectedValues.some((value) => value.includes("—"))) {
    throw new HumanizationError("RESTRICTION_CONFLICT", "An exact protected value conflicts with the em-dash restriction.");
  }
  if (parsed.data.avoid.includes("double_dash") && protectedValues.some((value) => value.includes("--"))) {
    throw new HumanizationError("RESTRICTION_CONFLICT", "An exact protected value conflicts with the double-dash restriction.");
  }
  return { ...parsed.data, text, preserve_terms: preserveTerms, avoid: unique(parsed.data.avoid) };
}

function systemPrompt(input: HumanizeRequest): string {
  const tone = {
    conversational: "conversational, straightforward, and comfortably informal",
    crisp: "direct, compact, and confidently clear",
    warm: "thoughtful, generous, and naturally inviting",
    polished: "professional and refined without sounding stiff or corporate",
  }[input.tone];
  const avoid = [
    input.avoid.includes("em_dash") ? "Do not use em dashes (—)." : null,
    input.avoid.includes("double_dash") ? "Do not use double dashes (--)." : null,
    input.avoid.includes("cliches") ? "Do not use clichés." : null,
    input.avoid.includes("salesy_language") ? "Do not use sales language or manufactured urgency." : null,
  ].filter(Boolean);

  return [
    "You are Loqui's exacting writing editor. Rewrite text naturally while preserving its meaning, factual claims, intent, and point of view.",
    "Non-negotiable rules:",
    "- Never invent or imply customer relationships, traction, funding, credentials, citations, personal details, or personal experience.",
    "- Preserve every name, company, URL, number, and required term exactly. Do not add new named or numeric facts.",
    "- Preserve negation, uncertainty, commitments, requests, and questions.",
    `- Use a ${tone} tone.`,
    `- Stay within ${input.max_characters} Unicode characters without cutting a word or sentence.`,
    input.language ? `- Write in language ${input.language}; do not translate exact protected values.` : "- Keep the input language.",
    "- Avoid generic AI phrasing, excessive enthusiasm, clichés, and repetitive sentence patterns.",
    ...avoid,
    "- Return only the revised text, with no title, preface, explanation, quotes, or markdown fence.",
  ].join("\n");
}

function userPrompt(input: HumanizeRequest, mode: "initial" | "shorter" | "corrective", previous?: string): string {
  const context = [
    input.recipient_name ? `Recipient name (context only; do not invent a relationship): ${input.recipient_name}` : null,
    input.recipient_context ? `Recipient context (context only; do not turn it into a new claim): ${input.recipient_context}` : null,
    input.preserve_terms.length ? `Required exact terms: ${JSON.stringify(input.preserve_terms)}` : null,
  ].filter(Boolean);
  const instruction =
    mode === "shorter"
      ? "The previous rewrite exceeded the character limit. Rewrite it more concisely while keeping every protected fact and complete sentence."
      : mode === "corrective"
        ? "The previous rewrite failed a preservation or style check. Correct it without adding facts and obey every rule."
        : "Rewrite the source text.";
  return [
    ...context,
    instruction,
    previous ? `Previous rewrite:\n<rewrite>\n${previous}\n</rewrite>` : null,
    `Source text:\n<source>\n${input.text}\n</source>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function applyPunctuationRestrictions(text: string, avoid: HumanizeRequest["avoid"]): { text: string; changed: boolean } {
  let rewritten = text;
  if (avoid.includes("em_dash")) rewritten = rewritten.replace(/\s*—\s*/gu, ", ");
  if (avoid.includes("double_dash")) rewritten = rewritten.replace(/\s*--\s*/gu, ", ");
  rewritten = rewritten.replace(/[ \t]+([,.;!?])/gu, "$1").replace(/,\s*,/gu, ",");
  return { text: rewritten.trim(), changed: rewritten.trim() !== text.trim() };
}

function styleViolations(text: string, avoid: HumanizeRequest["avoid"]): string[] {
  const violations: string[] = [];
  if (avoid.includes("em_dash") && text.includes("—")) violations.push("em dash");
  if (avoid.includes("double_dash") && text.includes("--")) violations.push("double dash");
  if (avoid.includes("cliches") && CLICHES.some((pattern) => pattern.test(text))) violations.push("cliché");
  if (avoid.includes("salesy_language") && SALESY.some((pattern) => pattern.test(text))) violations.push("sales language");
  return violations;
}

export class HumanizationEngine {
  private readonly complete: Completion;
  private readonly availableModels: () => string[];

  constructor(dependencies: HumanizationEngineDependencies = {}) {
    this.complete = dependencies.complete ?? completeChat;
    this.availableModels = dependencies.availableModels ?? defaultAvailableModels;
  }

  private async generate(
    input: HumanizeRequest,
    mode: "initial" | "shorter" | "corrective",
    options: HumanizeOptions,
    previous?: string
  ): Promise<{ text: string; usedFallback: boolean }> {
    const models = unique([options.preferredModel, ...this.availableModels()].filter((id): id is string => Boolean(id))).filter((id) => {
      const spec = getModel(id);
      return Boolean(spec && (spec.provider === "groq" || spec.provider === "cerebras"));
    });
    if (!models.length) {
      throw new HumanizationError("NO_PROVIDER", "Configure at least one Groq or Cerebras provider for humanization.");
    }

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt(input) },
      { role: "user", content: userPrompt(input, mode, previous) },
    ];
    for (let index = 0; index < models.length; index += 1) {
      try {
        const text = (await this.complete(models[index], messages, {
          signal: options.signal,
          temperature: 0.2,
          maxTokens: 2_048,
          timeoutMs: 15_000,
          retries: 1,
        })).trim();
        if (text) return { text, usedFallback: index > 0 };
      } catch {
        if (options.signal?.aborted) throw new HumanizationError("PROVIDER_UNAVAILABLE", "The humanization request was cancelled.", true);
      }
    }
    throw new HumanizationError("PROVIDER_UNAVAILABLE", "All configured humanization providers are temporarily unavailable.", true);
  }

  async humanize(rawInput: HumanizeRequest, options: HumanizeOptions = {}): Promise<HumanizeOutput> {
    const input = normalizeRequest(rawInput);
    const warnings: string[] = [];
    let mode: "initial" | "shorter" | "corrective" = "initial";
    let previous: string | undefined;
    let lengthRetried = false;

    for (let generation = 0; generation < 3; generation += 1) {
      const generated = await this.generate(input, mode, options, previous);
      if (generated.usedFallback && !warnings.includes("A configured fallback provider completed the rewrite.")) {
        warnings.push("A configured fallback provider completed the rewrite.");
      }
      let candidate = generated.text;

      if (characterCount(candidate) > input.max_characters) {
        if (lengthRetried || generation === 2) {
          throw new HumanizationError(
            "LENGTH_LIMIT_UNSATISFIED",
            "The text cannot be safely rewritten within max_characters while preserving required facts."
          );
        }
        lengthRetried = true;
        warnings.push("The first rewrite was retried to meet max_characters.");
        previous = candidate;
        mode = "shorter";
        continue;
      }

      const normalized = applyPunctuationRestrictions(candidate, input.avoid);
      candidate = normalized.text;
      if (normalized.changed && !warnings.includes("Prohibited punctuation was normalized.")) {
        warnings.push("Prohibited punctuation was normalized.");
      }
      const report = validateHumanization({
        original_text: input.text,
        rewritten_text: candidate,
        preserve_terms: input.preserve_terms,
      });
      const violations = styleViolations(candidate, input.avoid);
      if (report.valid && violations.length === 0 && characterCount(candidate) <= input.max_characters) {
        return {
          humanized_text: candidate,
          character_count: characterCount(candidate),
          within_limit: true,
          preserved_terms: input.preserve_terms.filter((term) => candidate.includes(term)),
          warnings,
        };
      }

      if (generation === 2) {
        throw new HumanizationError(
          "PRESERVATION_FAILED",
          "A safe rewrite could not satisfy all fact-preservation and style checks."
        );
      }
      previous = candidate;
      mode = "corrective";
    }

    throw new HumanizationError("INTERNAL_ERROR", "The humanization request could not be completed.");
  }

  validate(input: ValidationRequest): ValidationReport {
    return validateHumanization(input);
  }
}

export const defaultHumanizationEngine = new HumanizationEngine();

export interface HumanizationOperations {
  humanize(input: HumanizeRequest, options?: HumanizeOptions): Promise<HumanizeOutput>;
  validate(input: ValidationRequest): ValidationReport;
}

export type BatchItemResult =
  | { index: number; success: true; result: HumanizeOutput }
  | { index: number; success: false; error: PublicHumanizationError };

export async function humanizeBatch(
  requests: unknown[],
  operations: HumanizationOperations = defaultHumanizationEngine,
  concurrency = 3
): Promise<BatchItemResult[]> {
  if (!Array.isArray(requests) || requests.length < 1 || requests.length > MAX_BATCH_SIZE) {
    throw new HumanizationError("INVALID_INPUT", `Batch size must be between 1 and ${MAX_BATCH_SIZE}.`);
  }
  const results = new Array<BatchItemResult>(requests.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < requests.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        const parsed = humanizeRequestSchema.safeParse(requests[index]);
        if (!parsed.success) {
          throw new HumanizationError("INVALID_INPUT", "The humanization request is invalid.");
        }
        results[index] = { index, success: true, result: await operations.humanize(parsed.data) };
      } catch (error) {
        results[index] = { index, success: false, error: publicHumanizationError(error) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), requests.length) }, () => worker()));
  return results;
}
