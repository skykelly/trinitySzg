import { NextResponse } from "next/server";
import { createDebate, getAgents, searchKnowledgeSourcesForAgents } from "@/lib/db";
import { streamDebate } from "@/lib/debate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      question?: string;
      debateMode?: string;
      debateDepth?: string;
      outputType?: string;
    };
    const question = body.question?.trim();
    if (!question) {
      return NextResponse.json({ error: "question이 필요합니다." }, { status: 400 });
    }

    // getAgents(): 2쿼리 (에이전트 + 전체 소스 한 번에)
    // searchKnowledgeSourcesForAgents(): 1쿼리 (3개 에이전트 청크 검색을 한 번에)
    // 총 3쿼리 (기존: 5 + 6 = 11쿼리)
    const agents = getAgents();
    const sourcesByAgent = searchKnowledgeSourcesForAgents(question, agents, 6);
    const enrichedAgents = agents.map((agent) => ({
      ...agent,
      knowledgeSources: sourcesByAgent.get(agent.id) ?? agent.knowledgeSources ?? []
    }));

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const mode = body.debateMode ?? "Feasibility";
          const turns_hint = body.debateDepth ? `\nTurns: ${body.debateDepth}` : "";
          const enrichedQuestion = `${question}${turns_hint}`;
          const { turns, conclusion } = await streamDebate(enrichedQuestion, enrichedAgents, (token) => send("token", token), mode);
          const debate = createDebate(question, turns, conclusion);
          send("done", debate);
          controller.close();
        } catch (error) {
          send("error", error instanceof Error ? error.message : "알 수 없는 오류");
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 });
  }
}
