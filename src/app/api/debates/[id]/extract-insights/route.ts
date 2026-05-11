import { NextResponse } from "next/server";
import { extractDebateInsights } from "@/lib/debate-knowledge";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      domainId?: string;
      autoApprove?: boolean;
    };

    const insights = await extractDebateInsights(id, {
      domainId: body.domainId,
      autoApprove: body.autoApprove === true
    });

    return NextResponse.json({ debateId: id, count: insights.length, insights });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Insight 추출 실패" },
      { status: 500 }
    );
  }
}
