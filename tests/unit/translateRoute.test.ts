import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/translate/route";

const MODEL = "groq/llama-3.1-8b-instant";

function translateRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Build a provider SSE body of the shape the OpenAI-compatible APIs return. */
function sseResponse(chunks: string[]): Response {
  const body = [
    ...chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`),
    "data: [DONE]\n\n",
  ].join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

beforeEach(() => {
  process.env.GROQ_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.GROQ_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/translate", () => {
  it("streams the whole translation on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(["Ciao", ", ", "mondo"])));

    const res = await POST(
      translateRequest({ text: "Hello, world", sourceLang: "en", targetLang: "it", model: MODEL })
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Ciao, mondo");
  });

  it("reports a provider failure as a real status instead of dropping the connection", async () => {
    // Regression: the handler used to error an already-returned stream, so the
    // response died before any headers were sent. Proxies surface that as an
    // opaque "Application failed to respond" 502 with no usable detail.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      translateRequest({ text: "Hello", sourceLang: "en", targetLang: "it", model: MODEL })
    );

    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toContain("403");
    // The provider's own response body must never be relayed to the client.
    expect(body).not.toContain("forbidden");
  });

  it("reports a transient provider outage as 503 after exhausting retries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      translateRequest({ text: "Hello", sourceLang: "en", targetLang: "it", model: MODEL })
    );

    expect(res.status).toBe(503);
  });

  it("does not answer an empty translation with an empty 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([])));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      translateRequest({ text: "Hello", sourceLang: "en", targetLang: "it", model: MODEL })
    );

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await res.text()).toContain("empty translation");
  });

  it("rejects an unconfigured provider before calling out", async () => {
    delete process.env.GROQ_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await POST(
      translateRequest({ text: "Hello", sourceLang: "en", targetLang: "it", model: MODEL })
    );

    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
