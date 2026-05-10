import { NextResponse } from "next/server";
import { getConversation } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId)) {
    return NextResponse.json({ error: "올바른 conversation id가 필요합니다." }, { status: 400 });
  }

  const conversation = getConversation(conversationId);
  if (!conversation) {
    return NextResponse.json({ error: "채팅을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}
