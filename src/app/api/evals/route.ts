import { NextRequest, NextResponse } from "next/server";
import { listEvalRuns, listEvalResults } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const runId = req.nextUrl.searchParams.get("run");
  if (runId) {
    return NextResponse.json({ results: listEvalResults(runId) });
  }
  return NextResponse.json({ runs: listEvalRuns() });
}
