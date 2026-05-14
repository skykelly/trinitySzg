import { execFileSync } from "node:child_process";
import { join } from "node:path";

type QueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  lastInsertRowid: number | string;
};

const workerPath = join(process.cwd(), "src", "lib", "pg-worker.cjs");

function runQuery(mode: "all" | "get" | "run" | "exec", sql: string, params: unknown[] = []): QueryResult {
  const output = execFileSync(process.execPath, [workerPath, JSON.stringify({ mode, sql, params })], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    maxBuffer: 1024 * 1024 * 20
  });
  return JSON.parse(output) as QueryResult;
}

export class PostgresSync {
  exec(sql: string) {
    const statements = sql
      .split(/;\s*(?:\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) runQuery("exec", statement);
  }

  prepare(sql: string) {
    return {
      all: (...params: unknown[]) => runQuery("all", sql, params).rows,
      get: (...params: unknown[]) => runQuery("get", sql, params).rows[0],
      run: (...params: unknown[]) => {
        const result = runQuery("run", sql, params);
        return {
          changes: result.rowCount,
          lastInsertRowid: result.lastInsertRowid
        };
      }
    };
  }
}
