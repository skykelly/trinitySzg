import { execFileSync } from "node:child_process";
import { join } from "node:path";

type QueryResult = {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  lastInsertRowid: number | string;
};

const workerPath = join(process.cwd(), "src", "lib", "pg-worker.cjs");

function runQuery(mode: "all" | "get" | "run" | "exec" | "exec_batch", sql: string, params: unknown[] = []): QueryResult {
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

    if (statements.length <= 1) {
      // 구문이 하나면 기존 방식
      if (statements[0]) runQuery("exec", statements[0]);
    } else {
      // 여러 구문은 하나의 연결로 실행 (pg-worker 프로세스 1개로 처리)
      runQuery("exec_batch", JSON.stringify(statements));
    }
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
