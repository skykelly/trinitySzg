import { NextResponse } from "next/server";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export const runtime = "nodejs";

const RESTORE_TOKEN = process.env.RESTORE_TOKEN ?? "trinity-restore-2026";

export async function POST(request: Request) {
  const token = request.headers.get("x-restore-token");
  if (token !== RESTORE_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
    }

    const dbPath = join(process.cwd(), "data", "db-data", "app.db");
    mkdirSync(dirname(dbPath), { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(dbPath, buffer);

    return NextResponse.json({ ok: true, size: buffer.length, path: dbPath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "복원 실패" },
      { status: 500 }
    );
  }
}
