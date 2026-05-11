import { NextResponse } from "next/server";
import { createAgentOpinion, listAgentOpinions } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId") ?? undefined;
  const domainId = searchParams.get("domainId") ?? undefined;
  const query = searchParams.get("q") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
  const items = listAgentOpinions({ agentId, domainId, query, status, limit });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      agentId?: string;
      question?: string;
      claim?: string;
      rationale?: string;
      confidence?: string;
      tags?: string | string[];
      domainId?: string;
      conversationId?: string;
      messageId?: string;
    };

    if (!body.agentId || !body.question?.trim() || !body.claim?.trim()) {
      return NextResponse.json({ error: "agentId, question, claim이 필요합니다." }, { status: 400 });
    }

    const tags = Array.isArray(body.tags)
      ? body.tags.map(String)
      : String(body.tags ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);

    const confidence = body.confidence === "high" || body.confidence === "low" ? body.confidence : "medium";

    const opinion = createAgentOpinion({
      agentId: body.agentId,
      question: body.question.trim(),
      claim: body.claim.trim(),
      rationale: body.rationale?.trim() || undefined,
      evidenceRefs: [],
      confidence,
      tags,
      domainId: body.domainId,
      conversationId: body.conversationId,
      messageId: body.messageId,
      status: "draft"
    });

    return NextResponse.json({ opinion });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "알 수 없는 오류" },
      { status: 500 }
    );
  }
}
