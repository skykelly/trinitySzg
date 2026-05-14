import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, string> = {};

  // 1. 환경 변수 확인
  checks.supabase_db_url = process.env.SUPABASE_DB_URL ? "set" : "MISSING";
  checks.gemini_api_key = process.env.GEMINI_API_KEY ? "set" : "MISSING";
  checks.node_version = process.version;

  // 2. pg-worker 파일 존재 확인
  try {
    const { existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const workerPath = join(process.cwd(), "src", "lib", "pg-worker.cjs");
    const migrationPath = join(process.cwd(), "supabase", "migrations", "202605130001_initial_schema.sql");
    checks.pg_worker = existsSync(workerPath) ? "found" : "MISSING";
    checks.migration_sql = existsSync(migrationPath) ? "found" : "MISSING";
    checks.cwd = process.cwd();
  } catch (e) {
    checks.fs_check = e instanceof Error ? e.message : String(e);
  }

  // 3. DB 연결 확인
  try {
    const { getAgents } = await import("@/lib/db");
    const agents = getAgents();
    checks.db = `ok (${agents.length} agents)`;
  } catch (e) {
    checks.db = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  const ok = !Object.values(checks).some((v) => v.startsWith("MISSING") || v.startsWith("ERROR"));
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 500 });
}
