import { NextRequest } from "next/server";
import { publishDisplay, displaySubscriberCount, type DisplayEventKind } from "@/lib/displayBus";

export const dynamic = "force-dynamic";

const KINDS: DisplayEventKind[] = ["final", "interim", "clear"];

/**
 * POST /api/display/send
 * Body: { text?: string, kind?: "final" | "interim" | "clear", lang?: string }
 * Broadcasts a translated segment to all connected display clients.
 * Returns the number of listeners so the UI can show connection status.
 */
export async function POST(req: NextRequest) {
  let body: { text?: string; kind?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind: DisplayEventKind = KINDS.includes(body.kind as DisplayEventKind)
    ? (body.kind as DisplayEventKind)
    : "final";
  const text = kind === "clear" ? "" : (body.text ?? "").trim();
  if (kind !== "clear" && !text) {
    return Response.json({ error: "Missing text" }, { status: 400 });
  }
  if (text.length > 2000) {
    return Response.json({ error: "Text too long" }, { status: 413 });
  }

  const listeners = publishDisplay({
    kind,
    text,
    lang: (body.lang ?? "").slice(0, 8),
    ts: Date.now(),
  });
  return Response.json({ ok: true, listeners });
}

/** GET /api/display/send — connection status for the translator UI. */
export async function GET() {
  return Response.json({ listeners: displaySubscriberCount() });
}
