import { NextResponse } from "next/server";
import { MODELS, isModelEnabled, PROVIDERS } from "@/lib/models";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    models: MODELS.map((m) => ({
      id: m.id,
      label: m.label,
      provider: PROVIDERS[m.provider].label,
      speed: m.speed,
      enabled: isModelEnabled(m),
    })),
  });
}
