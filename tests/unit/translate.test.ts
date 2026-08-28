import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models", () => ({
  PROVIDERS: {
    groq: {
      id: "groq",
      label: "Test provider",
      baseUrl: "https://provider.invalid/v1",
      envKey: "LOQUI_TEST_PROVIDER_ENABLED",
    },
  },
  getModel: (id: string) =>
    id === "groq/llama-3.3-70b-versatile"
      ? {
          id,
          provider: "groq",
          model: "test-model",
          label: "Test model",
          speed: "fast",
        }
      : undefined,
}));

import { completeChat, ProviderRequestError } from "../../src/lib/translate";

const MODEL = "groq/llama-3.3-70b-versatile";
const MESSAGES = [{ role: "user", content: "Hello" }];

beforeEach(() => {
  process.env.LOQUI_TEST_PROVIDER_ENABLED = "true";
});

afterEach(() => {
  delete process.env.LOQUI_TEST_PROVIDER_ENABLED;
  vi.unstubAllGlobals();
});

describe("provider client reliability", () => {
  it("retries a transient provider status and returns the next valid response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("temporarily unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: "Hello there." } }] })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeChat(MODEL, MESSAGES, {
      retries: 1,
      retryDelayMs: 0,
      timeoutMs: 100,
    });

    expect(result).toBe("Hello there.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not expose a provider response body in errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private upstream detail", { status: 400 }))
    );

    const error = await completeChat(MODEL, MESSAGES, { retries: 0 }).catch((caught) => caught);

    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error.message).toContain("status 400");
    expect(error.message).not.toContain("private upstream detail");
  });

  it("aborts an attempt at its deadline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((request: Request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        })
      )
    );

    const error = await completeChat(MODEL, MESSAGES, { retries: 0, timeoutMs: 5 }).catch(
      (caught) => caught
    );

    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error.message).toContain("timed out");
    expect(error.retryable).toBe(true);
  });
});
