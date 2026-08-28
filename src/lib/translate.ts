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

export interface ChatOptions {
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  /** Per-attempt deadline. The default is deliberately short enough for agent workflows. */
  timeoutMs?: number;
  /** Retries only transient provider/network failures. */
  retries?: number;
  retryDelayMs?: number;
}

export type ChatMessage = { role: string; content: string };

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number
  ) {
    super(message);
    this.name = "ProviderRequestError";
  }
}

function attemptSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("Provider request timed out", "TimeoutError")),
    timeoutMs
  );
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  return { signal: combined, cleanup: () => clearTimeout(timer), timedOut: () => controller.signal.aborted };
}

async function retryDelay(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new ProviderRequestError("Request cancelled", false));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

function providerRequest(
  spec: ModelSpec,
  messages: ChatMessage[],
  stream: boolean,
  opts: ChatOptions,
  signal: AbortSignal
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
    signal,
  });
}

async function fetchProvider(
  spec: ModelSpec,
  messages: ChatMessage[],
  stream: boolean,
  opts: ChatOptions
): Promise<{ response: Response; cleanup: () => void }> {
  const retries = Math.max(0, opts.retries ?? 1);
  const timeoutMs = Math.max(1, opts.timeoutMs ?? 15_000);
  let lastError: ProviderRequestError | undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const deadline = attemptSignal(opts.signal, timeoutMs);
    try {
      const response = await fetch(providerRequest(spec, messages, stream, opts, deadline.signal));
      if (response.ok) return { response, cleanup: deadline.cleanup };

      const retryable = RETRYABLE_STATUS.has(response.status);
      response.body?.cancel().catch(() => undefined);
      lastError = new ProviderRequestError(
        `${spec.label} request failed with status ${response.status}`,
        retryable,
        response.status
      );
    } catch (error) {
      if (opts.signal?.aborted) {
        deadline.cleanup();
        throw new ProviderRequestError("Request cancelled", false);
      }
      lastError = new ProviderRequestError(
        deadline.timedOut() ? `${spec.label} request timed out` : `${spec.label} is temporarily unavailable`,
        true
      );
    }
    deadline.cleanup();

    if (!lastError.retryable || attempt === retries) throw lastError;
    await retryDelay((opts.retryDelayMs ?? 250) * 2 ** attempt, opts.signal);
  }

  throw lastError ?? new ProviderRequestError(`${spec.label} is temporarily unavailable`, true);
}

/**
 * Stream a chat completion from any configured provider.
 * Yields plain text deltas.
 */
export async function* streamChat(
  modelId: string,
  messages: ChatMessage[],
  opts: ChatOptions = {}
): AsyncGenerator<string> {
  const spec = getModel(modelId);
  if (!spec) throw new Error(`Unknown model: ${modelId}`);

  const { response: res, cleanup } = await fetchProvider(spec, messages, true, opts);
  if (!res.body) {
    cleanup();
    throw new ProviderRequestError(`${spec.label} returned an empty response`, true);
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
    cleanup();
  }
}

/** Non-streaming completion (used by evals). */
export async function completeChat(
  modelId: string,
  messages: ChatMessage[],
  opts: ChatOptions = {}
): Promise<string> {
  const spec = getModel(modelId);
  if (!spec) throw new Error(`Unknown model: ${modelId}`);

  const { response: res, cleanup } = await fetchProvider(spec, messages, false, opts);
  try {
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new ProviderRequestError(`${spec.label} returned an invalid response`, true);
    }
    return content.trim();
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(`${spec.label} returned an invalid response`, true);
  } finally {
    cleanup();
  }
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
