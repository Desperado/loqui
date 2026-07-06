import { NextRequest } from "next/server";
import { OPENAI_TTS_VOICES } from "@/lib/voices";

export const dynamic = "force-dynamic";

/**
 * POST /api/speak
 * Body: { text: string, lang?: "de" | "en" | "uk", voice?: OpenAiTtsVoice }
 * Server-side text-to-speech via OpenAI. Streams back MP3 audio.
 */
export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return new Response("TTS not configured (missing OPENAI_API_KEY)", { status: 503 });
  }

  let body: { text?: string; lang?: string; voice?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) return new Response("Missing text", { status: 400 });

  const voice = (OPENAI_TTS_VOICES as readonly string[]).includes(body.voice ?? "")
    ? (body.voice as (typeof OPENAI_TTS_VOICES)[number])
    : "nova";

  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input: text.slice(0, 2000),
        response_format: "mp3",
      }),
      signal: req.signal,
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      return new Response(`TTS error ${res.status}: ${detail.slice(0, 200)}`, { status: 502 });
    }
    return new Response(res.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 204 });
    const message = err instanceof Error ? err.message : "TTS failed";
    return new Response(message, { status: 502 });
  }
}
