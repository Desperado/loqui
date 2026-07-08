import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { addMessage, getConversation } from "@/lib/db";
import { isLang } from "@/lib/translate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const conversation = getConversation(id, session.user.id);
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const sourceText = String(body.sourceText ?? "").slice(0, 4000);
  const translatedText = String(body.translatedText ?? "").slice(0, 8000);
  if (!sourceText || !translatedText) {
    return NextResponse.json({ error: "sourceText and translatedText are required" }, { status: 400 });
  }

  const message = addMessage(id, {
    source_text: sourceText,
    translated_text: translatedText,
    source_lang: typeof body.sourceLang === "string" && isLang(body.sourceLang) ? body.sourceLang : "en",
    model: String(body.model ?? "").slice(0, 80),
    latency_ms: Number.isFinite(body.latencyMs) ? Math.round(body.latencyMs) : null,
  });
  return NextResponse.json({ message }, { status: 201 });
}
