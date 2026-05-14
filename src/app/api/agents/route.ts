import { NextResponse } from "next/server";
import { getAgents, updateAgents } from "@/lib/db";
import type { Agent } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ agents: getAgents() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { agents?: Agent[] };
    if (!body.agents || !Array.isArray(body.agents)) {
      return NextResponse.json({ error: "agents 배열이 필요합니다." }, { status: 400 });
    }

    return NextResponse.json({ agents: updateAgents(body.agents) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 });
  }
}
