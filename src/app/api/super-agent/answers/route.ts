import { NextResponse } from "next/server";
import { listSuperAgentAnswerSummaries } from "@/lib/super-agent";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50;
  const answers = listSuperAgentAnswerSummaries(limit);
  return NextResponse.json({ answers });
}
