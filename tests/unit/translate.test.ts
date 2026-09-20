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

import { completeChat, ProviderRequestError, streamChat } from "../../src/lib/translate";

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

describe("streaming deadlines", () => {
  /** Emits SSE chunks spaced `gapMs` apart, like a provider generating tokens. */
  function slowSseResponse(chunks: string[], gapMs: number): Response {
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          await new Promise((r) => setTimeout(r, gapMs));
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`)
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }

  it("keeps streaming past the connect timeout while chunks keep arriving", async () => {
    // Regression: the connect deadline stayed armed for the life of the stream,
    // so any translation longer than timeoutMs was truncated mid-sentence.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(slowSseResponse(["a", "b", "c", "d", "e"], 30)));

    let out = "";
    for await (const delta of streamChat(MODEL, MESSAGES, { timeoutMs: 60, retries: 0 })) {
      out += delta;
    }

    expect(out).toBe("abcde");
  });

  it("still aborts a provider that goes silent mid-stream", async () => {
    // A real fetch tears the response body down when its signal aborts, so the
    // mock has to do the same for the stall deadline to be observable here.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((request: Request) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ choices: [{ delta: { content: "a" } }] })}\n\n`
              )
            );
            // Then silence — only the stall deadline can end this.
            request.signal.addEventListener("abort", () => {
              controller.error(new DOMException("aborted", "AbortError"));
            });
          },
        });
        return Promise.resolve(new Response(body, { status: 200 }));
      })
    );

    await expect(async () => {
      for await (const _delta of streamChat(MODEL, MESSAGES, { timeoutMs: 50, retries: 0 })) {
        // drain until the deadline fires
      }
    }).rejects.toThrow();
  });
});
