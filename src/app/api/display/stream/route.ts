import { NextRequest } from "next/server";
import { subscribeDisplay, type DisplayEvent } from "@/lib/displayBus";

export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 15_000;

function authorized(req: NextRequest): boolean {
  const token = process.env.LOQUI_DISPLAY_TOKEN;
  if (!token) return true;
  const provided =
    req.nextUrl.searchParams.get("token") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return provided === token;
}

/**
 * GET /api/display/stream
 * Server-Sent Events feed of translated segments for external displays
 * (LED matrix tickers, kiosk browsers). Events are JSON DisplayEvent objects.
 * Optional auth: set LOQUI_DISPLAY_TOKEN and pass ?token=… or a Bearer header.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: DisplayEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      send({ kind: "clear", text: "", lang: "", ts: Date.now() });

      const unsubscribe = subscribeDisplay(send);
      const close = () => {
        clearInterval(keepalive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const keepalive = setInterval(() => {
        // SSE comment line — keeps proxies from idling out the connection.
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          close(); // client vanished without an abort event
        }
      }, KEEPALIVE_MS);
      req.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
