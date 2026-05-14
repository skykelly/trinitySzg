import { NextResponse } from "next/server";
import { streamAnswerWithSuperAgent } from "@/lib/super-agent";
import type { SuperAgentAnswerRequest } from "@/lib/super-agent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: Partial<SuperAgentAnswerRequest>;
  try {
    body = (await request.json()) as Partial<SuperAgentAnswerRequest>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (!body.question?.trim()) {
    return NextResponse.json({ error: "question이 필요합니다." }, { status: 400 });
  }

  const input: SuperAgentAnswerRequest = {
    question: body.question.trim(),
    timeHorizon: body.timeHorizon,
    outputType: body.outputType,
    includeDebateKnowledge: body.includeDebateKnowledge
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await streamAnswerWithSuperAgent(input, (token) => {
          controller.enqueue(encoder.encode(token));
        });
        const meta = JSON.stringify({ answerId: result.answerId, references: result.references });
        controller.enqueue(encoder.encode(`\x02${meta}\x03`));
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "답변 생성 실패";
        controller.error(new Error(message));
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform"
    }
  });
}
