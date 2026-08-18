import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function readRecurringMigration(): string {
  if (!existsSync(MIGRATIONS_DIR)) {
    return "";
  }

  return readdirSync(MIGRATIONS_DIR)
    .filter((filename) => filename.endsWith("_recurring_signals.sql"))
    .sort()
    .map((filename) => readFileSync(join(MIGRATIONS_DIR, filename), "utf8"))
    .join("\n");
}

const recurringMigration = readRecurringMigration();

function functionBody(functionName: string): string {
  const match = recurringMigration.match(
    new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\b[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$`,
      "i",
    ),
  );

  return match?.[1] ?? "";
}

describe("latest recurring signals SQL function", () => {
  it("defines get_recurring_signals_latest", () => {
    expect(functionBody("get_recurring_signals_latest")).not.toBe("");
  });

  it("returns only the latest period row for each recurring type and target key", () => {
    const body = functionBody("get_recurring_signals_latest").replace(
      /\s+/g,
      " ",
    );

    expect(body).toMatch(
      /distinct\s+on\s*\(\s*spending_signals\.type\s*,\s*spending_signals\.target_key\s*\)/i,
    );
    expect(body).toMatch(
      /type\s+in\s*\(\s*'recurring_payment'\s*,\s*'recurring_price_up'\s*\)/i,
    );
    expect(body).toMatch(
      /order\s+by\s+spending_signals\.type\s*,\s*spending_signals\.target_key\s*,\s*spending_signals\.period\s+desc/i,
    );
  });

  it("does not filter dismissed recurring signals out of the full subscriptions list", () => {
    const body = functionBody("get_recurring_signals_latest");

    expect(body).not.toMatch(/dismissed_at\s+(is|=)\s+null/i);
  });
});
