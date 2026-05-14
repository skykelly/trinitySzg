const { Pool } = require("pg");

function getDatabaseUrl() {
  return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || "";
}

function translatePlaceholders(sql) {
  let index = 0;
  let inSingle = false;
  let inDouble = false;
  let out = "";

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const prev = sql[i - 1];
    if (char === "'" && prev !== "\\" && !inDouble) inSingle = !inSingle;
    if (char === '"' && prev !== "\\" && !inSingle) inDouble = !inDouble;
    if (char === "?" && !inSingle && !inDouble) {
      index += 1;
      out += `$${index}`;
    } else {
      out += char;
    }
  }

  return out;
}

async function main() {
  const [payload] = process.argv.slice(2);
  const { mode, sql, params = [] } = JSON.parse(payload);
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("SUPABASE_DB_URL 또는 DATABASE_URL 환경 변수가 필요합니다.");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
  });

  try {
    if (sql.trim().toUpperCase().startsWith("PRAGMA")) {
      process.stdout.write(JSON.stringify({ rows: [], rowCount: 0 }));
      return;
    }

    // exec_batch: 여러 SQL 구문을 하나의 연결에서 순차 실행 (연결 비용 절약)
    if (mode === "exec_batch") {
      const statements = JSON.parse(sql);
      for (const stmt of statements) {
        if (stmt.trim()) await pool.query(stmt);
      }
      process.stdout.write(JSON.stringify({ rows: [], rowCount: 0, lastInsertRowid: 0 }));
      return;
    }

    const result = await pool.query(translatePlaceholders(sql), params);
    process.stdout.write(JSON.stringify({
      rows: result.rows,
      rowCount: result.rowCount,
      lastInsertRowid: result.rows?.[0]?.id ?? 0
    }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
