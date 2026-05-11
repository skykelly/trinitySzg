import { NextResponse } from "next/server";
import { getSuperAgentAnswerWithRefs } from "@/lib/super-agent";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const answer = getSuperAgentAnswerWithRefs(id);
  if (!answer) {
    return NextResponse.json({ error: "답변을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ answer });
}
