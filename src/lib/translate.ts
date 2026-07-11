import { getModel, PROVIDERS, type ModelSpec } from "./models";

export type Lang = "de" | "en" | "uk" | "fr" | "pl" | "es" | "la" | "it" | "sv";
export type SourceLang = "auto" | Lang;

export const LANG_NAMES: Record<Lang, string> = {
  de: "German",
  en: "English",
  uk: "Ukrainian",
  fr: "French",
  pl: "Polish",
  es: "Spanish",
  la: "Latin",
  it: "Italian",
  sv: "Swedish",
};

export const LANGS = Object.keys(LANG_NAMES) as Lang[];

export function isLang(value: string): value is Lang {
  return (LANGS as string[]).includes(value);
}

export function translationSystemPrompt(sourceLang: SourceLang, targetLang: Lang = "uk"): string {
  const target = LANG_NAMES[targetLang];
  const source =
    sourceLang === "auto"
      ? `the source language (${LANGS.map((l) => LANG_NAMES[l]).join(", ")})`
      : LANG_NAMES[sourceLang];
  return [
    `You are a professional simultaneous interpreter translating spoken ${source} into ${target}.`,
    "Rules:",
    `- Output ONLY the ${target} translation. No comments, no quotes, no explanations.`,
    sourceLang === "auto"
      ? `- Detect the source language automatically, then translate it into ${target}.`
      : null,
    "- Preserve the speaker's tone and register; keep it natural and idiomatic.",
    "- The input comes from live speech recognition: it may be a sentence fragment. Translate the fragment as-is without completing it.",
    "- Keep names, numbers and units accurate.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Instructions shared by the writing tool and its API route. */
export function humanizeSystemPrompt(style: "casual" | "crisp" | "warm" | "polished"): string {
  const styleGuidance = {
    casual: "Sound conversational, straightforward, and comfortably informal.",
    crisp: "Use direct, compact sentences with confident clarity.",
    warm: "Sound thoughtful, generous, and naturally inviting.",
    polished: "Sound professional and refined without becoming stiff or corporate.",
  }[style];

  return [
    "You are an exacting writing editor. Rewrite the user's text so it reads naturally and distinctly while remaining recognizably theirs.",
    "Rules:",
    "- Preserve every factual claim, important detail, intent, and point of view.",
    `- ${styleGuidance}`,
    "- Improve rhythm, specificity, and clarity. Remove filler and overly formulaic phrasing where it helps.",
    "- Never invent facts, citations, or personal experience.",
    "- Do not make claims about AI detection or whether text is human-written.",
    "- Return only the revised text: no title, preface, explanation, quotation marks, or markdown fence.",
  ].join("\n");
}

interface ChatOptions {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

function providerRequest(
  spec: ModelSpec,
  messages: { role: string; content: string }[],
  stream: boolean,
  opts: ChatOptions
): Request {
  const provider = PROVIDERS[spec.provider];
  const apiKey = process.env[provider.envKey];
  if (!apiKey) {
    throw new Error(`Missing ${provider.envKey} for provider ${provider.label}`);
  }
  return new Request(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: spec.model,
      messages,
      stream,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1024,
    }),
    signal: opts.signal ?? null,
  });
}

/**
 * Stream a chat completion from any configured provider.
 * Yields plain text deltas.
 */
export async function* streamChat(
  modelId: string,
  messages: { role: string; content: string }[],
  opts: ChatOptions = {}
): AsyncGenerator<string> {
  const spec = getModel(modelId);
  if (!spec) throw new Error(`Unknown model: ${modelId}`);

  const res = await fetch(providerRequest(spec, messages, true, opts));
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${spec.label} error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // ignore malformed keep-alive lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Non-streaming completion (used by evals). */
export async function completeChat(
  modelId: string,
  messages: { role: string; content: string }[],
  opts: ChatOptions = {}
): Promise<string> {
  const spec = getModel(modelId);
  if (!spec) throw new Error(`Unknown model: ${modelId}`);

  const res = await fetch(providerRequest(spec, messages, false, opts));
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${spec.label} error ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = await res.json();
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

export async function translateOnce(
  modelId: string,
  text: string,
  sourceLang: SourceLang,
  opts: ChatOptions = {}
): Promise<string> {
  return completeChat(
    modelId,
    [
      { role: "system", content: translationSystemPrompt(sourceLang) },
      { role: "user", content: text },
    ],
    opts
  );
}
