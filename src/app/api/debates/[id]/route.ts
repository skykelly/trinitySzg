import { NextResponse } from "next/server";
import { getDebate } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const debateId = Number(id);
  if (!Number.isInteger(debateId)) {
    return NextResponse.json({ error: "올바른 debate id가 필요합니다." }, { status: 400 });
  }

  const debate = getDebate(debateId);
  if (!debate) {
    return NextResponse.json({ error: "토론을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ debate });
}
