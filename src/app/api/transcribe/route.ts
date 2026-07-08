import { NextRequest } from "next/server";
import { isLang } from "@/lib/translate";

export const dynamic = "force-dynamic";

/**
 * Whisper hallucinates stock "outro" phrases on silent or near-silent audio
 * (e.g. "Дякую за перегляд!" / "Thanks for watching"). Drop transcriptions that
 * are dominated by one of these, or that Whisper itself flags as no-speech.
 */
const HALLUCINATION_PHRASES = [
  "дякую за перегляд",
  "дякую за увагу",
  "дякуємо за перегляд",
  "підписуйтесь на канал",
  "продовження далі",
  "субтитрував",
  "субтитри створені спільнотою amara.org",
  "thanks for watching",
  "thank you for watching",
  "please subscribe",
  "subscribe to the channel",
  "subtitles by the amara.org community",
  "vielen dank fürs zuschauen",
  "danke fürs zuschauen",
  "bis zum nächsten mal",
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[!.,…"'’`?-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Short filler outputs Whisper emits on silence/noise. Almost never a meaningful
 * standalone utterance in a translation app, so drop them outright.
 */
const SHORT_GENERIC = new Set([
  "you",
  "thank you",
  "thank you very much",
  "thanks",
  "bye",
  "bye bye",
  "goodbye",
  "okay",
  "ok",
  "the",
  "uh",
  "um",
  "hmm",
  "the end",
  "subscribe",
  "дякую",
  "дякую вам",
  "субтитри",
  "продовження далі",
]);

function filterHallucination(
  text: string,
  segments: Array<{ no_speech_prob?: number; avg_logprob?: number }>
): string {
  if (!text) return "";
  const n = normalize(text);
  // Whisper flags silence with no segments, high no_speech_prob, or very low confidence.
  const likelySilence =
    segments.length === 0 ||
    segments.every((s) => (s.no_speech_prob ?? 0) > 0.5 || (s.avg_logprob ?? 0) < -1.0);
  // Short fillers ("you", "thanks", "дякую") are dropped only when the clip also
  // looks like silence — so a real, confident "thank you" still translates.
  if (SHORT_GENERIC.has(n) && likelySilence) return "";
  for (const phrase of HALLUCINATION_PHRASES) {
    // Exact match, or a short output that is essentially just the phrase.
    if (n === phrase || (n.includes(phrase) && n.length <= phrase.length + 6)) return "";
  }
  if (likelySilence && segments.length > 0) return "";
  return text;
}

/**
 * POST /api/transcribe  (multipart form-data)
 * Fields: file=<audio blob>, sourceLang="auto"|<Lang>
 * Server-side speech-to-text via OpenAI Whisper. Returns { text, language }.
 * Language is auto-detected by Whisper; a non-auto sourceLang is passed as a hint.
 */
export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return Response.json({ error: "Transcription not configured (missing OPENAI_API_KEY)" }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: "Missing audio file" }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return Response.json({ error: "Audio too large" }, { status: 413 });
  }
  const sourceLang = String(form.get("sourceLang") ?? "auto");

  const upstream = new FormData();
  upstream.append("file", file, "audio.webm");
  upstream.append("model", "whisper-1");
  upstream.append("response_format", "verbose_json");
  if (isLang(sourceLang)) {
    upstream.append("language", sourceLang);
  }

  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: upstream,
      signal: req.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json({ error: `Whisper error ${res.status}: ${detail.slice(0, 200)}` }, { status: 502 });
    }
    const data = await res.json();
    const text = filterHallucination((data.text ?? "").trim(), data.segments ?? []);
    return Response.json({ text, language: data.language ?? null });
  } catch (err) {
    if (req.signal.aborted) return Response.json({ text: "", language: null });
    const message = err instanceof Error ? err.message : "Transcription failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
