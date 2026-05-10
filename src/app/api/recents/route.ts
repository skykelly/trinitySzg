import { NextResponse } from "next/server";
import { listRecents } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ recents: listRecents() });
}
