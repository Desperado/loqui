import { NextRequest } from "next/server";
import {
  ProviderRequestError,
  streamChat,
  translationSystemPrompt,
  isLang,
  type SourceLang,
  type Lang,
} from "@/lib/translate";
import { getModel, isModelEnabled } from "@/lib/models";

export const dynamic = "force-dynamic";

/**
 * A failed translation has to come back as a real HTTP status with a readable
 * body. Erroring a response that has already started streaming just destroys the
 * connection, which every proxy in front of this app reports as an opaque
 * "Application failed to respond" 502 — the user learns nothing and neither do we.
 */
function failure(err: unknown): Response {
  const headers = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };
  if (err instanceof ProviderRequestError) {
    // 503 for a blip worth retrying, 502 for an upstream that refused us outright
    // (revoked key, retired model) and will keep refusing until someone fixes it.
    return new Response(err.message, { status: err.retryable ? 503 : 502, headers });
  }
  console.error("translate: unexpected failure", err);
  return new Response("Translation failed", { status: 500, headers });
}

/**
 * POST /api/translate
 * Body: { text: string, sourceLang: SourceLang, targetLang: Lang, model: string }
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

  const deltas = streamChat(
    modelId,
    [
      { role: "system", content: translationSystemPrompt(sourceLang, targetLang) },
      { role: "user", content: text },
    ],
    { signal: req.signal }
  );

  // Pull the first token before returning a Response. Until it arrives no headers
  // have been sent, so a provider failure can still be reported as a status code.
  let first: IteratorResult<string>;
  try {
    first = await deltas.next();
  } catch (err) {
    if (req.signal.aborted) return new Response(null, { status: 204 });
    return failure(err);
  }
  if (first.done) {
    await deltas.return(undefined).catch(() => undefined);
    return failure(new ProviderRequestError(`${spec.label} returned an empty translation`, true));
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(first.value));
        for await (const delta of deltas) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        // Headers are already on the wire, so the status can no longer change.
        // Close cleanly: the client keeps the partial translation instead of
        // seeing the connection drop out from under it.
        if (!req.signal.aborted) console.error("translate: stream ended early", err);
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a client disconnect.
        }
      }
    },
    cancel() {
      // Belt and braces: req.signal already unwinds the generator on a client
      // disconnect, and returning into a generator mid-iteration can throw.
      try {
        void deltas.return(undefined).catch(() => undefined);
      } catch {
        // Already finished or still running — the abort signal handles it.
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
