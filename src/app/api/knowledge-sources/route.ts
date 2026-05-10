import { NextResponse } from "next/server";
import { createKnowledgeSource, listKnowledgeSources, searchKnowledgeSources } from "@/lib/db";
import type { KnowledgeSource } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId") ?? undefined;
  const query = searchParams.get("q")?.trim();
  const sources = query ? searchKnowledgeSources(query, agentId, 12) : listKnowledgeSources(agentId);
  return NextResponse.json({ sources });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<Omit<KnowledgeSource, "id" | "createdAt" | "updatedAt">> & {
      tags?: string[] | string;
    };

    if (!body.agentId || !body.title?.trim() || !body.url?.trim() || !body.summary?.trim()) {
      return NextResponse.json({ error: "agentId, title, url, summary가 필요합니다." }, { status: 400 });
    }

    const tags = Array.isArray(body.tags)
      ? body.tags.map(String)
      : String(body.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);

    const source = createKnowledgeSource({
      agentId: body.agentId,
      title: body.title.trim(),
      url: body.url.trim(),
      sourceType: body.sourceType?.trim() || "manual_source",
      reliability:
        body.reliability === "very_high" ||
        body.reliability === "high" ||
        body.reliability === "medium" ||
        body.reliability === "low"
          ? body.reliability
          : "medium",
      priority: Number(body.priority ?? 3),
      summary: body.summary.trim(),
      tags
    });

    return NextResponse.json({ source });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 });
  }
}
