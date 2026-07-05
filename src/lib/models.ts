// Model registry: every provider speaks the OpenAI chat-completions protocol,
// so routing is just a base URL + API key + model id.

export type ProviderId = "cerebras" | "groq" | "google" | "openai";

export interface Provider {
  id: ProviderId;
  label: string;
  baseUrl: string;
  envKey: string;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    envKey: "CEREBRAS_API_KEY",
  },
  groq: {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
  },
  google: {
    id: "google",
    label: "Google AI",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    envKey: "GOOGLE_AI_API_KEY",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
  },
};

export interface ModelSpec {
  /** Unique id used throughout the app, e.g. "cerebras/gemma-4-31b". */
  id: string;
  provider: ProviderId;
  /** Model name sent to the provider API. */
  model: string;
  label: string;
  /** Rough speed hint shown in the UI. */
  speed: "ultra" | "fast" | "standard";
}

export const MODELS: ModelSpec[] = [
  {
    id: "cerebras/gemma-4-31b",
    provider: "cerebras",
    model: "gemma-4-31b",
    label: "Gemma 4 31B (Cerebras)",
    speed: "ultra",
  },
  {
    id: "cerebras/gpt-oss-120b",
    provider: "cerebras",
    model: "gpt-oss-120b",
    label: "GPT-OSS 120B (Cerebras)",
    speed: "fast",
  },
  {
    id: "groq/llama-3.1-8b-instant",
    provider: "groq",
    model: "llama-3.1-8b-instant",
    label: "Llama 3.1 8B Instant (Groq)",
    speed: "ultra",
  },
  {
    id: "groq/llama-3.3-70b-versatile",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B (Groq)",
    speed: "fast",
  },
  {
    id: "google/gemma-3-27b-it",
    provider: "google",
    model: "gemma-3-27b-it",
    label: "Gemma 3 27B (Google AI)",
    speed: "fast",
  },
  {
    id: "google/gemini-2.0-flash",
    provider: "google",
    model: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash (Google AI)",
    speed: "fast",
  },
  {
    id: "openai/gpt-4o-mini",
    provider: "openai",
    model: "gpt-4o-mini",
    label: "GPT-4o mini (OpenAI)",
    speed: "standard",
  },
];

export function isModelEnabled(spec: ModelSpec): boolean {
  return Boolean(process.env[PROVIDERS[spec.provider].envKey]);
}

export function getModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

export function enabledModels(): ModelSpec[] {
  return MODELS.filter(isModelEnabled);
}
