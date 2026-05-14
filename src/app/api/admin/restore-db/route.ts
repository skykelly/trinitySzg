import { NextResponse } from "next/server";

export const runtime = "nodejs";

const RESTORE_TOKEN = process.env.RESTORE_TOKEN ?? "trinity-restore-2026";

export async function POST(request: Request) {
  const token = request.headers.get("x-restore-token");
  if (token !== RESTORE_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error:
        "SQLite 파일 복원은 Supabase 마이그레이션 이후 지원하지 않습니다. supabase/migrations SQL 또는 Supabase 대시보드의 import 기능을 사용하세요."
    },
    { status: 410 }
  );
}
