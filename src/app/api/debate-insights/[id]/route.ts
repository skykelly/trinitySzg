import { NextResponse } from "next/server";
import { updateDebateInsightStatus } from "@/lib/db";
import type { DebateInsightStatus } from "@/lib/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const validStatuses = new Set<DebateInsightStatus>(["draft", "approved", "deprecated", "rejected"]);

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as { status?: string };
    if (!body.status || !validStatuses.has(body.status as DebateInsightStatus)) {
      return NextResponse.json({ error: "status는 draft | approved | deprecated | rejected 중 하나여야 합니다." }, { status: 400 });
    }
    const insight = updateDebateInsightStatus(id, body.status as DebateInsightStatus);
    return NextResponse.json({ insight });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "상태 변경 실패" },
      { status: 500 }
    );
  }
}
