import { NextResponse } from "next/server";
import { answerWithSuperAgent } from "@/lib/super-agent";
import type { SuperAgentAnswerRequest } from "@/lib/super-agent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<SuperAgentAnswerRequest>;

    if (!body.question?.trim()) {
      return NextResponse.json({ error: "question이 필요합니다." }, { status: 400 });
    }

    const result = await answerWithSuperAgent({
      question: body.question.trim(),
      domainId: body.domainId,
      timeHorizon: body.timeHorizon,
      customerSegment: body.customerSegment,
      outputType: body.outputType,
      includeDebateKnowledge: body.includeDebateKnowledge,
      includeAgentOpinions: body.includeAgentOpinions,
      selectedSourceIds: body.selectedSourceIds,
      context: body.context
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    const isProviderError =
      message.includes("API 오류") || message.includes("RESOURCE_EXHAUSTED");
    return NextResponse.json({ error: message }, { status: isProviderError ? 502 : 500 });
  }
}
