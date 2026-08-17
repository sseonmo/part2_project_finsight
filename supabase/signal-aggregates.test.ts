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

describe("signal aggregate SQL functions", () => {
  const functions = [
    "get_category_monthly_totals",
    "get_period_transactions",
    "get_category_amount_medians",
    "get_merchant_history",
    "get_seen_merchants_before_period",
  ];

  it.each(functions)("defines %s", (functionName) => {
    expect(functionBody(functionName)).not.toBe("");
  });

  it.each(functions)(
    "%s only reads eligible expense transactions",
    (functionName) => {
      const body = functionBody(functionName).replace(/\s+/g, " ");

      expect(body).toMatch(/transaction_type\s*=\s*'expense'/i);
      expect(body).toMatch(/category_fallback\s*=\s*false/i);
      expect(body).toMatch(/amount\s*>\s*0/i);
    },
  );

  it("keeps signal threshold decisions out of SQL", () => {
    const aggregateMigration =
      readdirSync(MIGRATIONS_DIR)
        .filter((filename) => filename.endsWith("_signal_aggregates.sql"))
        .map((filename) => readFileSync(join(MIGRATIONS_DIR, filename), "utf8"))
        .join("\n") ?? "";

    expect(aggregateMigration).not.toMatch(/\b30000\b|\b50000\b|\b100000\b/);
    expect(aggregateMigration).not.toMatch(/\b0\.3\b|\b0\.1\b/);
  });
});
