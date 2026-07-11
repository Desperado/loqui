import { NextRequest } from "next/server";
import { humanizeSystemPrompt, streamChat } from "@/lib/translate";
import { getModel, isModelEnabled } from "@/lib/models";

export const dynamic = "force-dynamic";

type HumanizeStyle = "casual" | "crisp" | "warm" | "polished";
const styles = new Set<HumanizeStyle>(["casual", "crisp", "warm", "polished"]);

/** POST /api/humanize — stream a meaning-preserving writing rewrite. */
export async function POST(req: NextRequest) {
  let body: { text?: string; style?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const style: HumanizeStyle = styles.has(body.style as HumanizeStyle) ? (body.style as HumanizeStyle) : "casual";
  const modelId = body.model ?? "";
  if (!text) return new Response("Missing text", { status: 400 });
  if (text.length > 12_000) return new Response("Text too long (12,000 character limit)", { status: 413 });

  const spec = getModel(modelId);
  if (!spec) return new Response(`Unknown model: ${modelId}`, { status: 400 });
  if (spec.provider !== "groq" && spec.provider !== "cerebras") {
    return new Response("Humanize supports Groq and Cerebras open models only", { status: 400 });
  }
  if (!isModelEnabled(spec)) return new Response(`${spec.label} is not configured (missing API key)`, { status: 503 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of streamChat(modelId, [{ role: "system", content: humanizeSystemPrompt(style) }, { role: "user", content: text }], { signal: req.signal, temperature: 0.72, maxTokens: 2_048 })) controller.enqueue(encoder.encode(delta));
        controller.close();
      } catch (error) {
        if (req.signal.aborted) controller.close();
        else controller.error(error);
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
