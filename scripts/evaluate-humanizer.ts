import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { buildHumanizationMessages, validateHumanization, type HumanizeRequest } from "../src/lib/humanization";
import { HUMANIZER_EVAL_SET } from "../src/lib/humanizerEvalset";
import { HUMANIZER_UPSTREAM, reviewEditorialPatterns } from "../src/lib/humanizerRubric";
import { chrF } from "../src/lib/metrics";
import { MODELS, isModelEnabled } from "../src/lib/models";
import { completeChat } from "../src/lib/translate";

type Variant = "baseline" | "rubric";

interface EvalRecord {
  model: string;
  variant: Variant;
  itemId: string;
  category: string;
  language: string;
  output: string;
  referenceChrf: number | null;
  preservationPassed: boolean | null;
  editorialViolations: string[];
  latencyMs: number | null;
  error: string | null;
}

function requestedOutputPath(): string {
  const outputIndex = process.argv.indexOf("--output");
  const explicit = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (explicit) return path.resolve(explicit);
  const timestamp = new Date().toISOString().replace(/[:.]/gu, "-");
  return path.resolve("data", "evals", `humanizer-${timestamp}.json`);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function summarize(records: EvalRecord[]) {
  return Object.fromEntries(
    MODELS.filter((model) => records.some((record) => record.model === model.id)).map((model) => [
      model.id,
      Object.fromEntries(
        (["baseline", "rubric"] as const).map((variant) => {
          const matching = records.filter((record) => record.model === model.id && record.variant === variant);
          const successful = matching.filter((record) => !record.error);
          const preservationPassed = successful.filter((record) => record.preservationPassed).length;
          const editorialPassed = successful.filter((record) => record.editorialViolations.length === 0).length;
          return [
            variant,
            {
              items: successful.length,
              errors: matching.length - successful.length,
              avgReferenceChrf: average(successful.flatMap((record) => record.referenceChrf ?? [])),
              preservationPassRate: successful.length ? preservationPassed / successful.length : null,
              editorialPassRate: successful.length ? editorialPassed / successful.length : null,
              avgLatencyMs: average(successful.flatMap((record) => record.latencyMs ?? [])),
            },
          ];
        })
      ),
    ])
  );
}

async function main() {
  loadEnvConfig(process.cwd());
  const models = MODELS.filter(
    (model) => (model.provider === "groq" || model.provider === "cerebras") && isModelEnabled(model)
  );
  if (!models.length) {
    throw new Error("Configure GROQ_API_KEY or CEREBRAS_API_KEY to run the humanizer evaluation.");
  }

  const records: EvalRecord[] = [];
  for (const model of models) {
    for (const variant of ["baseline", "rubric"] as const) {
      for (const item of HUMANIZER_EVAL_SET) {
        const request: HumanizeRequest = {
          text: item.source,
          tone: "conversational",
          max_characters: 12_000,
          preserve_terms: [],
          avoid: [],
          language: item.language,
        };
        const started = performance.now();
        try {
          const output = await completeChat(
            model.id,
            buildHumanizationMessages(request, { includeEditorialRubric: variant === "rubric" }),
            { temperature: 0.2, maxTokens: 2_048, timeoutMs: 15_000, retries: 1 }
          );
          const latencyMs = Math.round(performance.now() - started);
          const preservation = validateHumanization({
            original_text: item.source,
            rewritten_text: output,
            preserve_terms: [],
          });
          records.push({
            model: model.id,
            variant,
            itemId: item.id,
            category: item.category,
            language: item.language,
            output,
            referenceChrf: chrF(output, item.reference),
            preservationPassed: preservation.valid,
            editorialViolations: reviewEditorialPatterns({ text: output, language: item.language }).map(({ id }) => id),
            latencyMs,
            error: null,
          });
        } catch (error) {
          records.push({
            model: model.id,
            variant,
            itemId: item.id,
            category: item.category,
            language: item.language,
            output: "",
            referenceChrf: null,
            preservationPassed: null,
            editorialViolations: [],
            latencyMs: null,
            error: error instanceof Error ? error.message : "Evaluation request failed.",
          });
        }
      }
    }
  }

  const report = {
    createdAt: new Date().toISOString(),
    upstream: HUMANIZER_UPSTREAM,
    methodology: {
      baseline: "Loqui humanization prompt without the adapted editorial rubric",
      rubric: "The same prompt with the adapted editorial rubric",
      quality: ["reference chrF", "fact-preservation pass rate", "editorial-review pass rate"],
      latency: "end-to-end provider completion time in milliseconds",
    },
    summary: summarize(records),
    records,
  };
  const outputPath = requestedOutputPath();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Humanizer evaluation written to ${outputPath}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Humanizer evaluation failed.");
  process.exitCode = 1;
});
