import { NextResponse } from "next/server";
import { listDebates } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ debates: listDebates() });
}
