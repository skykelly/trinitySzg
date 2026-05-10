import { NextResponse } from "next/server";
import { addMessage, createConversation, getAgent, searchKnowledgeSources } from "@/lib/db";
import { streamText } from "@/lib/llm";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      agentId?: string;
      message?: string;
      history?: ChatMessage[];
      conversationId?: number;
      saveConversation?: boolean;
    };

    if (!body.agentId || !body.message?.trim()) {
      return NextResponse.json({ error: "agentId와 message가 필요합니다." }, { status: 400 });
    }

    const agent = getAgent(body.agentId);
    if (!agent) {
      return NextResponse.json({ error: "AI를 찾을 수 없습니다." }, { status: 404 });
    }
    const groundedAgent = {
      ...agent,
      knowledgeSources: searchKnowledgeSources(body.message.trim(), agent.id, 6)
    };

    const shouldSave = body.saveConversation !== false;
    const conversationId =
      shouldSave && (body.conversationId ?? createConversation(agent.id, body.message.trim().slice(0, 80) || "새 대화"));
    const messages = [...(body.history ?? []), { role: "user", content: body.message.trim() } satisfies ChatMessage];
    if (conversationId) addMessage(conversationId, "user", body.message.trim());

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const answer = await streamText({
            agent: groundedAgent,
            messages,
            onToken: (token) => {
              controller.enqueue(encoder.encode(token));
            }
          });

          if (conversationId) addMessage(conversationId, "assistant", answer);
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        ...(conversationId ? { "X-Conversation-Id": String(conversationId) } : {})
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 });
  }
}
