import { NextResponse } from "next/server";
import { createDebate, getAgents } from "@/lib/db";
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

    const agents = getAgents();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const enrichedQuestion = `${question}

Debate Mode: ${body.debateMode ?? "Balanced Debate"}
Depth: ${body.debateDepth ?? "Standard"}
Output Type: ${body.outputType ?? "Decision Memo"}`;
          const { turns, conclusion } = await streamDebate(enrichedQuestion, agents, (token) => send("token", token));
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
