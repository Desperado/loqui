import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getModel, isModelEnabled } from "@/lib/models";
import { translateOnce, completeChat } from "@/lib/translate";
import { chrF } from "@/lib/metrics";
import { TRANSLATION_EVAL_SET } from "@/lib/evalset";
import { addEvalResult, createEvalRun, updateEvalSummary } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JUDGE_PROMPT = (source: string, reference: string, output: string) =>
  [
    "You are evaluating a machine translation into Ukrainian.",
    `Source: ${source}`,
    `Reference translation: ${reference}`,
    `Candidate translation: ${output}`,
    "Rate the candidate from 1 (unusable) to 5 (perfect) for adequacy and fluency in Ukrainian.",
    "Answer with ONLY the number.",
  ].join("\n");

/**
 * POST /api/evals/run
 * Body: { models: string[], judge?: boolean, judgeModel?: string }
 * Streams NDJSON progress lines:
 *   {type:"start", runId, total}
 *   {type:"result", model, itemId, chrf, judgeScore, latencyMs, output, error?}
 *   {type:"done", runId, summary}
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const body = await req.json().catch(() => ({}));

  const modelIds: string[] = Array.isArray(body.models) ? body.models.slice(0, 6) : [];
  const specs = modelIds.map((id) => getModel(id)).filter((s) => s && isModelEnabled(s));
  if (specs.length === 0) {
    return new Response(JSON.stringify({ error: "No configured models selected" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const useJudge = Boolean(body.judge);
  const judgeSpec = body.judgeModel ? getModel(String(body.judgeModel)) : specs[0];
  const judgeId = useJudge && judgeSpec && isModelEnabled(judgeSpec) ? judgeSpec.id : null;

  const runId = createEvalRun(session?.user?.id ?? null, "translation", specs.map((s) => s!.id), {
    status: "running",
  });

  const encoder = new TextEncoder();
  const total = specs.length * TRANSLATION_EVAL_SET.length;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      emit({ type: "start", runId, total });

      const perModel: Record<string, { chrfSum: number; judgeSum: number; judged: number; latencySum: number; count: number; errors: number }> = {};

      for (const spec of specs) {
        const modelId = spec!.id;
        perModel[modelId] = { chrfSum: 0, judgeSum: 0, judged: 0, latencySum: 0, count: 0, errors: 0 };

        for (const item of TRANSLATION_EVAL_SET) {
          if (req.signal.aborted) break;
          let output = "";
          let error: string | null = null;
          let latencyMs: number | null = null;
          let score: number | null = null;
          let judgeScore: number | null = null;

          try {
            const started = Date.now();
            output = await translateOnce(modelId, item.source, item.sourceLang, {
              signal: req.signal,
            });
            latencyMs = Date.now() - started;
            score = chrF(output, item.reference);
            perModel[modelId].chrfSum += score;
            perModel[modelId].latencySum += latencyMs;
            perModel[modelId].count++;

            if (judgeId) {
              try {
                const verdict = await completeChat(
                  judgeId,
                  [{ role: "user", content: JUDGE_PROMPT(item.source, item.reference, output) }],
                  { maxTokens: 10, signal: req.signal }
                );
                const parsed = parseFloat(verdict.match(/[1-5](\.\d+)?/)?.[0] ?? "");
                if (!Number.isNaN(parsed)) {
                  judgeScore = parsed;
                  perModel[modelId].judgeSum += parsed;
                  perModel[modelId].judged++;
                }
              } catch {
                // judge failures are non-fatal
              }
            }
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
            perModel[modelId].errors++;
          }

          addEvalResult({
            run_id: runId,
            model: modelId,
            item_id: item.id,
            source_lang: item.sourceLang,
            source: item.source,
            reference: item.reference,
            output,
            chrf: score,
            judge_score: judgeScore,
            latency_ms: latencyMs,
            error,
          });

          emit({
            type: "result",
            model: modelId,
            itemId: item.id,
            source: item.source,
            reference: item.reference,
            output,
            chrf: score,
            judgeScore,
            latencyMs,
            error,
          });
        }
      }

      const summary = Object.fromEntries(
        Object.entries(perModel).map(([model, s]) => [
          model,
          {
            avgChrf: s.count ? Math.round((s.chrfSum / s.count) * 10) / 10 : null,
            avgJudge: s.judged ? Math.round((s.judgeSum / s.judged) * 100) / 100 : null,
            avgLatencyMs: s.count ? Math.round(s.latencySum / s.count) : null,
            items: s.count,
            errors: s.errors,
          },
        ])
      );
      updateEvalSummary(runId, { status: "done", perModel: summary });
      emit({ type: "done", runId, summary });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
