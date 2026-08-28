import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HumanizationEngine } from "../../src/lib/humanization";
import { createLoquiMcpServer } from "../../src/mcp/server";

const MODEL = "groq/llama-3.3-70b-versatile";

describe("Loqui MCP tools", () => {
  let client: Client;
  let server: ReturnType<typeof createLoquiMcpServer>;

  beforeEach(async () => {
    const engine = new HumanizationEngine({
      availableModels: () => [MODEL],
      complete: async (_model, messages) => {
        const prompt = messages.at(-1)?.content ?? "";
        return prompt.match(/<source>\n([\s\S]*?)\n<\/source>/u)?.[1] ?? "";
      },
    });
    server = createLoquiMcpServer(engine);
    client = new Client({ name: "loqui-integration-tests", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterEach(async () => {
    await Promise.allSettled([client.close(), server.close()]);
  });

  it("exposes all three tools", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map(({ name }) => name).sort()).toEqual([
      "humanize_batch",
      "humanize_text",
      "validate_humanization",
    ]);
  });

  it("calls humanize_text and returns structured output", async () => {
    const result = await client.callTool({
      name: "humanize_text",
      arguments: {
        text: "Élodie Müller at Acme Corp will send 42 reports.",
        tone: "warm",
        max_characters: 100,
        preserve_terms: ["Acme Corp"],
        avoid: ["em_dash", "double_dash"],
      },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      humanized_text: "Élodie Müller at Acme Corp will send 42 reports.",
      within_limit: true,
      preserved_terms: ["Acme Corp"],
    });
  });

  it("calls humanize_batch and keeps ordered success and error entries", async () => {
    const result = await client.callTool({
      name: "humanize_batch",
      arguments: {
        requests: [
          { text: "First item.", tone: "crisp", max_characters: 50 },
          { text: "", tone: "warm", max_characters: 50 },
          { text: "Third item.", tone: "polished", max_characters: 50 },
        ],
      },
    });
    const content = result.structuredContent as {
      results: Array<{ index: number; success: boolean; error?: { code: string } }>;
    };

    expect(content.results.map(({ index }) => index)).toEqual([0, 1, 2]);
    expect(content.results.map(({ success }) => success)).toEqual([true, false, true]);
    expect(content.results[1].error?.code).toBe("INVALID_INPUT");
  });

  it("calls validate_humanization and reports preservation failures", async () => {
    const result = await client.callTool({
      name: "validate_humanization",
      arguments: {
        original_text: "Acme Corp will ship 12 units to https://example.com.",
        rewritten_text: "Acme Corp will ship units.",
        preserve_terms: ["Acme Corp"],
      },
    });

    expect(result.structuredContent).toMatchObject({
      valid: false,
      checks: {
        numbers: { preserved: false, missing: ["12"] },
        links: { preserved: false, missing: ["https://example.com"] },
      },
    });
  });

  it("returns a structured MCP error for an invalid single request", async () => {
    const result = await client.callTool({
      name: "humanize_text",
      arguments: { text: "", tone: "crisp", max_characters: 50 },
    });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].type === "text" ? result.content[0].text : "{}")).toEqual({
      error: {
        code: "INVALID_INPUT",
        message: "Text must not be empty.",
        retryable: false,
      },
    });
  });
});
