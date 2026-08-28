import { NextRequest } from "next/server";
import { defaultHumanizationEngine, publicHumanizationError } from "@/lib/humanization";
import { getModel, isModelEnabled } from "@/lib/models";

export const dynamic = "force-dynamic";

type HumanizeStyle = "casual" | "crisp" | "warm" | "polished";
const styles = new Set<HumanizeStyle>(["casual", "crisp", "warm", "polished"]);

/** POST /api/humanize — return a validated, meaning-preserving writing rewrite. */
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

  if (modelId) {
    const spec = getModel(modelId);
    if (!spec) return new Response("Unknown model", { status: 400 });
    if (spec.provider !== "groq" && spec.provider !== "cerebras") {
      return new Response("Humanize supports Groq and Cerebras open models only", { status: 400 });
    }
    if (!isModelEnabled(spec)) return new Response("The selected humanization model is not configured", { status: 503 });
  }

  try {
    const result = await defaultHumanizationEngine.humanize(
      {
        text,
        tone: style === "casual" ? "conversational" : style,
        max_characters: 12_000,
        preserve_terms: [],
        avoid: [],
      },
      { preferredModel: modelId || undefined, signal: req.signal }
    );
    return new Response(result.humanized_text, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const safe = publicHumanizationError(error);
    const status = safe.code === "INVALID_INPUT" ? 400 : safe.retryable ? 503 : 422;
    return Response.json({ error: safe }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
