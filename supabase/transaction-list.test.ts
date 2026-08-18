import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function readMigrationSql(): string {
  if (!existsSync(MIGRATIONS_DIR)) {
    return "";
  }

  return readdirSync(MIGRATIONS_DIR)
    .filter((filename) => filename.endsWith(".sql"))
    .sort()
    .map((filename) => readFileSync(join(MIGRATIONS_DIR, filename), "utf8"))
    .join("\n");
}

const migrationSql = readMigrationSql();

function functionBody(functionName: string): string {
  const match = migrationSql.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\b[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
      "i",
    ),
  );

  return match?.[1] ?? "";
}

function functionSignature(functionName: string): string {
  const match = migrationSql.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\(([\\s\\S]*?)\\)\\s*returns`,
      "i",
    ),
  );

  return match?.[1] ?? "";
}

describe("transaction list SQL functions", () => {
  const functions = ["get_transactions_page", "get_transactions_summary"];

  it.each(functions)("defines %s", (functionName) => {
    expect(functionBody(functionName)).not.toBe("");
  });

  it.each(functions)(
    "%s resolves categories through user overrides before filtering",
    (functionName) => {
      const body = functionBody(functionName).replace(/\s+/g, " ");

      expect(body).toMatch(/left\s+join\s+public\.user_category_overrides/i);
      expect(body).toMatch(
        /coalesce\s*\(\s*user_category_overrides\.category\s*,\s*transactions\.category\s*,\s*'기타'::public\.transaction_category\s*\)\s+as\s+effective_category/i,
      );
      expect(body).toMatch(/effective_category\s*=\s*any\s*\(\s*p_categories\s*\)/i);
    },
  );

  it.each(functions)(
    "%s searches both raw and normalized merchant names",
    (functionName) => {
      const body = functionBody(functionName).replace(/\s+/g, " ");

      expect(body).toMatch(/transactions\.merchant_raw\s+ilike/i);
      expect(body).toMatch(/transactions\.merchant_normalized\s+ilike/i);
    },
  );

  it("does not filter refunds or deposits out of the transaction page", () => {
    const body = functionBody("get_transactions_page").replace(/\s+/g, " ");

    expect(body).not.toMatch(/transaction_type\s*=\s*'expense'/i);
    expect(body).not.toMatch(/transaction_type\s*=\s*'refund'/i);
    expect(body).not.toMatch(/transaction_type\s*=\s*'deposit'/i);
  });

  it("keeps expense, refund, and deposit totals separate in the summary", () => {
    const body = functionBody("get_transactions_summary").replace(/\s+/g, " ");

    expect(body).toMatch(/filter\s*\(\s*where\s+transaction_type\s*=\s*'expense'/i);
    expect(body).toMatch(/filter\s*\(\s*where\s+transaction_type\s*=\s*'refund'/i);
    expect(body).toMatch(/filter\s*\(\s*where\s+transaction_type\s*=\s*'deposit'/i);
  });

  it("orders pages by newest transaction date then stable id", () => {
    const body = functionBody("get_transactions_page").replace(/\s+/g, " ");

    expect(body).toMatch(/order\s+by\s+transacted_on\s+desc\s*,\s+id\b/i);
  });

  // 두 함수 모두 "검색어 없음 = null", "필터 없음 = null" 을 본문에서 처리한다.
  // 선언에 default 가 없으면 생성되는 Database 타입이 파라미터를 필수로 만들어
  // 호출부에서 null 을 넘길 수 없게 된다.
  it.each(functions)(
    "%s declares optional filters with a null default",
    (functionName) => {
      const signature = functionSignature(functionName).replace(/\s+/g, " ");

      expect(signature).toMatch(/p_search\s+text\s+default\s+null/i);
      expect(signature).toMatch(
        /p_categories\s+public\.transaction_category\[\]\s+default\s+null/i,
      );
    },
  );
});
