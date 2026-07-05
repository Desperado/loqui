import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/transcribe  (multipart form-data)
 * Fields: file=<audio blob>, sourceLang="auto"|"de"|"en"|"uk"
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
  if (sourceLang === "de" || sourceLang === "en" || sourceLang === "uk") {
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
    return Response.json({ text: (data.text ?? "").trim(), language: data.language ?? null });
  } catch (err) {
    if (req.signal.aborted) return Response.json({ text: "", language: null });
    const message = err instanceof Error ? err.message : "Transcription failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
