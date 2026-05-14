import { NextResponse } from "next/server";
import { listSuperAgentAnswerSummaries, saveAllAnswers } from "@/lib/super-agent";
import type { SaveAnswersInput } from "@/lib/super-agent";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 50;
    const answers = listSuperAgentAnswerSummaries(limit);
    return NextResponse.json({ answers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<SaveAnswersInput>;
    if (!body.question?.trim()) {
      return NextResponse.json({ error: "question이 필요합니다." }, { status: 400 });
    }
    const id = saveAllAnswers({
      question: body.question.trim(),
      scenarioMarkdown: body.scenarioMarkdown ?? "",
      businessMarkdown: body.businessMarkdown ?? "",
      executiveMarkdown: body.executiveMarkdown ?? ""
    });
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 });
  }
}
