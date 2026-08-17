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

describe("dashboard aggregate SQL functions", () => {
  const functions = [
    "get_dashboard_summary",
    "get_dashboard_category_breakdown",
    "get_dashboard_monthly_flow",
    "get_dashboard_top_merchants",
  ];

  it.each(functions)("defines %s", (functionName) => {
    expect(functionBody(functionName)).not.toBe("");
  });

  it.each(functions)(
    "%s includes expense transactions without excluding category fallback rows",
    (functionName) => {
      const body = functionBody(functionName).replace(/\s+/g, " ");

      expect(body).toMatch(/transaction_type\s*=\s*'expense'/i);
      expect(body).not.toMatch(/category_fallback\s*=\s*false/i);
    },
  );

  it.each([
    "get_dashboard_summary",
    "get_dashboard_category_breakdown",
    "get_dashboard_top_merchants",
  ])("%s applies user overrides before transaction categories", (functionName) => {
    const body = functionBody(functionName).replace(/\s+/g, " ");

    expect(body).toMatch(/left\s+join\s+public\.user_category_overrides/i);
    expect(body).toMatch(
      /coalesce\s*\(\s*user_category_overrides\.category\s*,\s*transactions\.category\s*,\s*'기타'::public\.transaction_category\s*\)/i,
    );
  });

  it("fills missing months in the dashboard flow", () => {
    const body = functionBody("get_dashboard_monthly_flow");

    expect(body).toMatch(/generate_series/i);
    expect(body).toMatch(/coalesce\s*\(\s*expense_totals\.total_amount/i);
  });

  it("keeps refunds and deposits separate from expense totals", () => {
    const body = functionBody("get_dashboard_summary").replace(/\s+/g, " ");

    expect(body).toMatch(/transaction_type\s*=\s*'refund'/i);
    expect(body).toMatch(/transaction_type\s*=\s*'deposit'/i);
  });
});
