import { NextResponse } from "next/server";
import { deleteKnowledgeSource, getKnowledgeSource, updateKnowledgeSourceMeta } from "@/lib/db";
import type { KnowledgeSource } from "@/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const source = getKnowledgeSource(Number(id));
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ source });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = (await request.json()) as Partial<{
      title: string; summary: string; reliability: KnowledgeSource["reliability"];
      priority: number; sourceType: string; tags: string[] | string; domainId: string;
    }>;
    const tags = body.tags === undefined
      ? undefined
      : Array.isArray(body.tags)
        ? body.tags.map(String)
        : String(body.tags).split(",").map(t => t.trim()).filter(Boolean);
    const updated = updateKnowledgeSourceMeta(Number(id), {
      title: body.title?.trim(),
      summary: body.summary?.trim(),
      reliability: body.reliability,
      priority: body.priority !== undefined ? Number(body.priority) : undefined,
      sourceType: body.sourceType?.trim(),
      tags,
      domainId: body.domainId?.trim() || undefined
    });
    return NextResponse.json({ source: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const source = getKnowledgeSource(Number(id));
    if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
    deleteKnowledgeSource(Number(id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "삭제 실패" }, { status: 500 });
  }
}
