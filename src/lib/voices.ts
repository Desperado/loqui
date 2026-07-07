// TTS voice personas for /api/speak. All voices below are supported by
// OpenAI's gpt-4o-mini-tts model — persona selection is just picking which
// one to send, no extra provider needed.

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
  id: string;
  label: string;
  voice: OpenAiTtsVoice;
}

export const VOICE_PERSONAS: VoicePersona[] = [
  { id: "woman", label: "Female", voice: "nova" },
  { id: "man", label: "Male", voice: "onyx" },
  { id: "other", label: "Neutral", voice: "alloy" },
];

export const DEFAULT_PERSONA_ID = "woman";

export function personaVoice(personaId: string): OpenAiTtsVoice {
  return VOICE_PERSONAS.find((p) => p.id === personaId)?.voice ?? "nova";
}
