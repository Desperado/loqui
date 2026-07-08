import { NextRequest } from "next/server";
import { streamChat, translationSystemPrompt, isLang, type SourceLang, type Lang } from "@/lib/translate";
import { getModel, isModelEnabled } from "@/lib/models";

export const dynamic = "force-dynamic";

/**
 * POST /api/translate
 * Body: { text: string, sourceLang: SourceLang, model: string }
 * Streams the translation as plain text chunks.
 */
export async function POST(req: NextRequest) {
  let body: { text?: string; sourceLang?: string; targetLang?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const sourceLang: SourceLang =
    body.sourceLang && isLang(body.sourceLang) ? body.sourceLang : "auto";
  const targetLang: Lang = body.targetLang && isLang(body.targetLang) ? body.targetLang : "uk";
  const modelId = body.model ?? "";

  if (!text) return new Response("Missing text", { status: 400 });
  if (text.length > 4000) return new Response("Text too long", { status: 413 });

  const spec = getModel(modelId);
  if (!spec) return new Response(`Unknown model: ${modelId}`, { status: 400 });
  if (!isModelEnabled(spec)) {
    return new Response(`Model ${spec.label} is not configured (missing API key)`, { status: 503 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of streamChat(
          modelId,
          [
            { role: "system", content: translationSystemPrompt(sourceLang, targetLang) },
            { role: "user", content: text },
          ],
          { signal: req.signal }
        )) {
          controller.enqueue(encoder.encode(delta));
        }
        controller.close();
      } catch (err) {
        if (req.signal.aborted) {
          controller.close();
          return;
        }
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
