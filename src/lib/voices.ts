// TTS voice personas for /api/speak. All voices below are supported by
// OpenAI's gpt-4o-mini-tts model — persona selection is just picking which
// one to send, no extra provider needed.

import type { TranslationKey } from "@/lib/i18n";

export const OPENAI_TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
] as const;

export type OpenAiTtsVoice = (typeof OPENAI_TTS_VOICES)[number];

export interface VoicePersona {
  id: "woman" | "man" | "other";
  labelKey: Extract<TranslationKey, "female" | "male" | "neutral">;
  voice: OpenAiTtsVoice;
}

export const VOICE_PERSONAS: readonly VoicePersona[] = [
  { id: "woman", labelKey: "female", voice: "nova" },
  { id: "man", labelKey: "male", voice: "onyx" },
  { id: "other", labelKey: "neutral", voice: "alloy" },
];

export const DEFAULT_PERSONA_ID = "woman";

export function personaVoice(personaId: string): OpenAiTtsVoice {
  return VOICE_PERSONAS.find((p) => p.id === personaId)?.voice ?? "nova";
}
