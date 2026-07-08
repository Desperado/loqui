import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createConversation, listConversations } from "@/lib/db";
import { isLang } from "@/lib/translate";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ conversations: listConversations(session.user.id) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "Untitled session").slice(0, 120);
  const sourceLang = typeof body.sourceLang === "string" && isLang(body.sourceLang) ? body.sourceLang : "en";
  const model = String(body.model ?? "").slice(0, 80);

  const conversation = createConversation(session.user.id, title, sourceLang, model);
  return NextResponse.json({ conversation }, { status: 201 });
}
