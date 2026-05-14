import { NextResponse } from "next/server";
import { listDebateInsights } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const domainId = searchParams.get("domainId") ?? undefined;
    const query = searchParams.get("q") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
    const items = listDebateInsights({ domainId, query, status, limit });
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 });
  }
}
