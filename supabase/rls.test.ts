import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CATEGORIES } from "../src/lib/categories";

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

function tableBody(tableName: string): string {
  const match = migrationSql.match(
    new RegExp(
      `create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+(?:public\\.)?${tableName}\\s*\\(([\\s\\S]*?)\\);`,
      "i",
    ),
  );

  return match?.[1] ?? "";
}

function expectOwnPolicy(tableName: string, action: string): void {
  const policyPattern =
    action === "insert"
      ? `create\\s+policy\\s+[^;]+\\s+on\\s+(?:public\\.)?${tableName}\\s+for\\s+insert[^;]+with\\s+check\\s*\\(\\s*user_id\\s*=\\s*auth\\.uid\\s*\\(\\s*\\)\\s*\\)`
      : `create\\s+policy\\s+[^;]+\\s+on\\s+(?:public\\.)?${tableName}\\s+for\\s+${action}[^;]+using\\s*\\(\\s*user_id\\s*=\\s*auth\\.uid\\s*\\(\\s*\\)\\s*\\)`;

  expect(migrationSql).toMatch(new RegExp(policyPattern, "i"));
}

describe("Supabase schema guardrails", () => {
  const userDataTables = [
    "profiles",
    "upload_jobs",
    "transactions",
    "user_category_overrides",
    "csv_format_fingerprints",
    "spending_signals",
    "monthly_reports",
  ];

  it.each(userDataTables)(
    "enables owner-scoped RLS policies for %s",
    (tableName) => {
      expect(migrationSql).toMatch(
        new RegExp(
          `alter\\s+table\\s+(?:public\\.)?${tableName}\\s+enable\\s+row\\s+level\\s+security`,
          "i",
        ),
      );

      for (const action of ["select", "insert", "update", "delete"]) {
        expectOwnPolicy(tableName, action);
      }
    },
  );

  it("keeps merchant_categories as a global merchant/category cache only", () => {
    const body = tableBody("merchant_categories");

    expect(body).not.toMatch(/\buser_id\b/i);
    expect(body).not.toMatch(/\bamount\b/i);
    expect(body).not.toMatch(/\btransacted_on\b/i);
    expect(body).not.toMatch(/\bdate\b/i);
    expect(body).not.toContain("날짜");
  });

  it("locks processed_webhook_events to the service role", () => {
    expect(migrationSql).toMatch(
      /alter\s+table\s+(?:public\.)?processed_webhook_events\s+enable\s+row\s+level\s+security/i,
    );
    expect(migrationSql).not.toMatch(
      /create\s+policy\s+[^;]+\s+on\s+(?:public\.)?processed_webhook_events/i,
    );
    expect(tableBody("processed_webhook_events").replace(/\s+/g, " ")).toMatch(
      /event_id\s+text\s+primary\s+key/i,
    );
  });

  it("enforces dedupe_key uniqueness in transactions", () => {
    const body = tableBody("transactions").replace(/\s+/g, " ");

    expect(body).toMatch(
      /dedupe_key\s+text\s+not\s+null\s+unique|unique\s*\(\s*dedupe_key\s*\)/i,
    );
  });

  it("scopes csv_format_fingerprints by user_id and header_hash", () => {
    const body = tableBody("csv_format_fingerprints").replace(/\s+/g, " ");

    expect(body).toMatch(/primary\s+key\s*\(\s*user_id\s*,\s*header_hash\s*\)/i);
  });

  it("requires upload_jobs.card_label", () => {
    const body = tableBody("upload_jobs").replace(/\s+/g, " ");

    expect(body).toMatch(/\bcard_label\s+text\s+not\s+null\b/i);
  });

  it("matches database category values to src/lib/categories.ts", () => {
    const enumValues =
      migrationSql
        .match(/create\s+type\s+(?:public\.)?transaction_category\s+as\s+enum\s*\(([^)]*)\)/i)?.[1]
        ?.match(/'([^']+)'/g)
        ?.map((value) => value.slice(1, -1)) ?? [];

    expect(enumValues).toEqual([...CATEGORIES]);
  });
});
