import { describe, expect, it, vi } from "vitest";
import {
  HumanizationEngine,
  HumanizationError,
  MAX_WRITING_SAMPLE_CHARACTERS,
  buildHumanizationMessages,
  characterCount,
  humanizeBatch,
  publicHumanizationError,
  validateHumanization,
  type HumanizationOperations,
  type HumanizeRequest,
} from "../../src/lib/humanization";

const MODEL = "groq/llama-3.3-70b-versatile";
const FALLBACK_MODEL = "cerebras/gpt-oss-120b";

function request(overrides: Partial<HumanizeRequest> = {}): HumanizeRequest {
  return {
    text: "Please review the draft today.",
    tone: "conversational",
    max_characters: 200,
    preserve_terms: [],
    avoid: [],
    ...overrides,
  };
}

function engineWith(...responses: Array<string | Error>) {
  const complete = vi.fn(async (_modelId: string, _messages: Array<{ role: string; content: string }>) => {
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (response === undefined) throw new Error("No test response configured");
    return response;
  });
  return {
    complete,
    engine: new HumanizationEngine({ complete, availableModels: () => [MODEL] }),
  };
}

describe("HumanizationEngine", () => {
  it("preserves names, companies, numbers, URLs, and required terms", async () => {
    const text = "Élodie Müller at Acme Corp will send 42 reports via https://example.com/report. Keep AlphaBeta.";
    const { engine } = engineWith(text);

    const result = await engine.humanize(
      request({ text, preserve_terms: ["AlphaBeta"], tone: "polished" })
    );

    expect(result.humanized_text).toBe(text);
    expect(result.preserved_terms).toEqual(["AlphaBeta"]);
    expect(result.within_limit).toBe(true);
  });

  it("retries once with a shorter rewrite when the first result is too long", async () => {
    const { engine, complete } = engineWith(
      "Please send the report today when you have enough time to review every single detail carefully.",
      "Please send the report today."
    );

    const result = await engine.humanize(
      request({ text: "Please send the report today when you can.", max_characters: 35 })
    );

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.humanized_text).toBe("Please send the report today.");
    expect(result.character_count).toBeLessThanOrEqual(35);
    expect(result.warnings).toContain("The first rewrite was retried to meet max_characters.");
  });

  it("counts Unicode code points and preserves Unicode names", async () => {
    const text = "Zoë 李 will reply today. 😊";
    const { engine } = engineWith(text);

    const result = await engine.humanize(request({ text, max_characters: 40 }));

    expect(result.character_count).toBe(characterCount(text));
    expect(result.humanized_text).toContain("Zoë 李");
  });

  it("rejects empty input before contacting a provider", async () => {
    const { engine, complete } = engineWith("unused");

    await expect(engine.humanize(request({ text: "   " }))).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(complete).not.toHaveBeenCalled();
  });

  it("validates the writing sample before contacting a provider", async () => {
    const { engine, complete } = engineWith("unused");

    await expect(
      engine.humanize(request({ writing_sample: "x".repeat(MAX_WRITING_SAMPLE_CHARACTERS + 1) }))
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(complete).not.toHaveBeenCalled();
  });

  it("uses a writing sample only as style guidance", async () => {
    const complete = vi.fn(async (_model: string, messages: Array<{ role: string; content: string }>) => {
      expect(messages[0].content).toContain("Use none of its facts, names, numbers, claims, or subject matter.");
      expect(messages[1].content).toContain(JSON.stringify("Short sentences. Dry humor."));
      return "Please review the draft today.";
    });
    const engine = new HumanizationEngine({ complete, availableModels: () => [MODEL] });

    await engine.humanize(request({ writing_sample: "Short sentences. Dry humor." }));

    expect(complete).toHaveBeenCalledOnce();
  });

  it("can isolate the rubric for baseline-versus-rubric evaluations", () => {
    const baseline = buildHumanizationMessages(request(), { includeEditorialRubric: false });
    const rubric = buildHumanizationMessages(request(), { includeEditorialRubric: true });

    expect(baseline[0].content).not.toContain("Editorial pass:");
    expect(rubric[0].content).toContain("Editorial pass:");
    expect(baseline[1].content).toBe(rubric[1].content);
  });

  it("rejects facts copied only from the writing sample", async () => {
    const unsafe = "Please review the Acme Corp draft today.";
    const { engine } = engineWith(unsafe, unsafe, unsafe);

    await expect(
      engine.humanize(request({ writing_sample: "Acme Corp uses clipped sentences." }))
    ).rejects.toMatchObject({ code: "PRESERVATION_FAILED" });
  });

  it("retries a factually valid draft that fails editorial review", async () => {
    const source = "It is not just fast, but reliable.";
    const { engine, complete } = engineWith(source, "It is fast and reliable.");

    const result = await engine.humanize(request({ text: source, language: "en" }));

    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1][1][1].content).toContain("empty not-X-but-Y contrast");
    expect(result.humanized_text).toBe("It is fast and reliable.");
    expect(result.warnings).toContain("The first rewrite was retried after an editorial review.");
  });

  it("falls back across the Groq and Cerebras model abstraction", async () => {
    const complete = vi.fn(async (modelId: string) => {
      if (modelId === MODEL) throw new Error("upstream unavailable");
      return "Please review the draft today.";
    });
    const engine = new HumanizationEngine({
      complete,
      availableModels: () => [MODEL, FALLBACK_MODEL],
    });

    const result = await engine.humanize(request());

    expect(complete.mock.calls.map(([model]) => model)).toEqual([MODEL, FALLBACK_MODEL]);
    expect(result.warnings).toContain("A configured fallback provider completed the rewrite.");
  });

  it("returns a safe structured error when every provider fails", async () => {
    const complete = vi.fn(async () => {
      throw new Error("upstream unavailable");
    });
    const engine = new HumanizationEngine({
      complete,
      availableModels: () => [MODEL, FALLBACK_MODEL],
    });

    const error = await engine.humanize(request()).catch((caught) => caught);

    expect(publicHumanizationError(error)).toEqual({
      code: "PROVIDER_UNAVAILABLE",
      message: "All configured humanization providers are temporarily unavailable.",
      retryable: true,
    });
  });

  it("normalizes prohibited em dashes and double dashes", async () => {
    const { engine } = engineWith("Please review—the draft--today.");

    const result = await engine.humanize(
      request({ avoid: ["em_dash", "double_dash"] })
    );

    expect(result.humanized_text).not.toContain("—");
    expect(result.humanized_text).not.toContain("--");
    expect(result.warnings).toContain("Prohibited punctuation was normalized.");
  });

  it("rejects newly invented relationship or traction claims", async () => {
    const unsafe = "Acme Corp is trusted by our customers.";
    const { engine } = engineWith(unsafe, unsafe, unsafe);

    await expect(
      engine.humanize(request({ text: "Acme Corp makes analytics software." }))
    ).rejects.toMatchObject({ code: "PRESERVATION_FAILED" });
  });
});

describe("validateHumanization", () => {
  it("reports missing factual values, claims, intent, and required terms", () => {
    const report = validateHumanization({
      original_text:
        "Could Élodie Müller at Acme Corp send 42 reports to https://example.com? Keep AlphaBeta.",
      rewritten_text: "Someone may send reports.",
      preserve_terms: ["AlphaBeta"],
    });

    expect(report.valid).toBe(false);
    expect(report.checks.names.missing).toContain("Élodie Müller");
    expect(report.checks.companies.missing).toContain("Acme Corp");
    expect(report.checks.numbers.missing).toContain("42");
    expect(report.checks.links.missing).toContain("https://example.com");
    expect(report.checks.required_terms.missing).toEqual(["AlphaBeta"]);
    expect(report.checks.claims.preserved).toBe(false);
    expect(report.checks.intent.preserved).toBe(false);
  });

  it("allows rhetorical negation to be removed only when both positive claims remain", () => {
    expect(
      validateHumanization({
        original_text: "The export is not just fast, but reliable.",
        rewritten_text: "The export is fast and reliable.",
        preserve_terms: [],
      }).valid
    ).toBe(true);

    const unsafe = validateHumanization({
      original_text: "The export is not just fast, but reliable.",
      rewritten_text: "The export is reliable.",
      preserve_terms: [],
    });
    expect(unsafe.valid).toBe(false);
    expect(unsafe.checks.claims.concerns).toContain("A positive claim inside a rhetorical contrast disappeared.");
  });
});

describe("humanizeBatch", () => {
  it("preserves input order, writing samples, and a result for every item", async () => {
    const writingSamples: Array<string | undefined> = [];
    const operations: HumanizationOperations = {
      async humanize(input) {
        writingSamples.push(input.writing_sample);
        if (!input.text.trim()) throw new HumanizationError("INVALID_INPUT", "Text must not be empty.");
        await new Promise((resolve) => setTimeout(resolve, input.text === "first" ? 10 : 0));
        return {
          humanized_text: input.text,
          character_count: characterCount(input.text),
          within_limit: true,
          preserved_terms: [],
          warnings: [],
        };
      },
      validate: validateHumanization,
    };

    const results = await humanizeBatch(
      [request({ text: "first", writing_sample: "Short and direct." }), request({ text: "" }), request({ text: "third" })],
      operations,
      3
    );

    expect(results.map(({ index }) => index)).toEqual([0, 1, 2]);
    expect(results.map(({ success }) => success)).toEqual([true, false, true]);
    expect(results[1]).toMatchObject({ error: { code: "INVALID_INPUT" } });
    expect(writingSamples).toContain("Short and direct.");
  });
});
