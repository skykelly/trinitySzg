import { NextResponse } from "next/server";
import { listDebates } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ debates: listDebates() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 });
  }
}
