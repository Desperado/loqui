import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  MAX_BATCH_SIZE,
  defaultHumanizationEngine,
  humanizeBatch,
  humanizeOutputSchema,
  humanizeRequestSchema,
  publicHumanizationError,
  type HumanizationOperations,
  validationOutputSchema,
  validationRequestSchema,
} from "../lib/humanization";

const publicErrorSchema = z.object({
  code: z.enum([
    "INVALID_INPUT",
    "NO_PROVIDER",
    "PROVIDER_UNAVAILABLE",
    "LENGTH_LIMIT_UNSATISFIED",
    "PRESERVATION_FAILED",
    "RESTRICTION_CONFLICT",
    "INTERNAL_ERROR",
  ]),
  message: z.string(),
  retryable: z.boolean(),
});

const batchResultSchema = z.discriminatedUnion("success", [
  z.object({ index: z.number().int().nonnegative(), success: z.literal(true), result: humanizeOutputSchema }),
  z.object({ index: z.number().int().nonnegative(), success: z.literal(false), error: publicErrorSchema }),
]);

const batchRequestSchema = z
  .object({ requests: z.array(humanizeRequestSchema).min(1).max(MAX_BATCH_SIZE) })
  .strict();

const batchOutputSchema = z.object({ results: z.array(batchResultSchema) });

function resultContent<T extends Record<string, unknown>>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function errorContent(error: unknown) {
  const safeError = publicHumanizationError(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: safeError }) }],
  };
}

export function createLoquiMcpServer(
  operations: HumanizationOperations = defaultHumanizationEngine
): McpServer {
  const server = new McpServer(
    { name: "loqui-humanization", version: "1.0.0" },
    {
      instructions:
        "Use Loqui to humanize text while preserving factual claims, protected terms, names, companies, links, numbers, and intent.",
    }
  );

  server.registerTool(
    "humanize_text",
    {
      title: "Humanize text",
      description:
        "Rewrite text naturally within a character limit while preserving facts and exact protected values.",
      inputSchema: humanizeRequestSchema,
      outputSchema: humanizeOutputSchema,
    },
    async (input) => {
      try {
        return resultContent(await operations.humanize(input));
      } catch (error) {
        return errorContent(error);
      }
    }
  );

  server.registerTool(
    "humanize_batch",
    {
      title: "Humanize a batch",
      description:
        "Humanize up to 50 requests with bounded concurrency, preserving input order and returning an individual result for every item.",
      inputSchema: batchRequestSchema,
      outputSchema: batchOutputSchema,
    },
    async ({ requests }) => {
      try {
        return resultContent({ results: await humanizeBatch(requests, operations) });
      } catch (error) {
        return errorContent(error);
      }
    }
  );

  server.registerTool(
    "validate_humanization",
    {
      title: "Validate a humanization",
      description:
        "Compare source and rewritten text for preservation of names, companies, numbers, links, claims, intent, and required terms.",
      inputSchema: validationRequestSchema,
      outputSchema: validationOutputSchema,
    },
    async (input) => {
      try {
        return resultContent(operations.validate(input));
      } catch (error) {
        return errorContent(error);
      }
    }
  );

  return server;
}
