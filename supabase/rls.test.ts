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

      // profiles 의 쓰기는 아래 전용 테스트가 본다. 결제 컬럼을 사용자에게 열면 안 된다.
      const actions =
        tableName === "profiles"
          ? ["select"]
          : ["select", "insert", "update", "delete"];

      for (const action of actions) {
        expectOwnPolicy(tableName, action);
      }
    },
  );

  describe("profiles billing columns", () => {
    // 여러 마이그레이션을 이어 붙인 SQL 에서, 마지막에 남는 상태를 본다.
    function lastIndexOf(pattern: string): number {
      const matches = [...migrationSql.matchAll(new RegExp(pattern, "gi"))];
      return matches.length ? matches[matches.length - 1].index : -1;
    }

    function lastCreatePolicy(name: string): string {
      const matches = [
        ...migrationSql.matchAll(
          new RegExp(`create\\s+policy\\s+${name}\\b[\\s\\S]*?;`, "gi"),
        ),
      ];
      return matches.length
        ? matches[matches.length - 1][0].replace(/\s+/g, " ")
        : "";
    }

    it.each(["profiles_update_own", "profiles_delete_own"])(
      "drops %s so users cannot rewrite or recreate their subscription",
      (policy) => {
        // 사용자가 PATCH /rest/v1/profiles 로 subscription_status 를 active 로 바꾸거나,
        // 행을 지운 뒤 다시 넣어 체험을 되돌리면 결제 없이 권한이 켜진다.
        const created = lastIndexOf(`create\\s+policy\\s+${policy}\\b`);
        const dropped = lastIndexOf(
          `drop\\s+policy\\s+(?:if\\s+exists\\s+)?${policy}\\s+on\\s+(?:public\\.)?profiles`,
        );

        expect(dropped).toBeGreaterThan(created);
      },
    );

    it("revokes update and delete on profiles from client roles", () => {
      const revoke = [
        ...migrationSql.matchAll(
          /revoke\s+([^;]+?)\s+on\s+(?:table\s+)?(?:public\.)?profiles\s+from\s+([^;]+);/gi,
        ),
      ].map((m) => ({ privileges: m[1], roles: m[2] }));

      const covers = (privilege: string, role: string) =>
        revoke.some(
          (r) =>
            new RegExp(`\\b${privilege}\\b`, "i").test(r.privileges) &&
            new RegExp(`\\b${role}\\b`, "i").test(r.roles),
        );

      for (const role of ["anon", "authenticated"]) {
        expect(covers("update", role)).toBe(true);
        expect(covers("delete", role)).toBe(true);
      }
    });

    it("lets users insert only their own fresh trial row", () => {
      // 로그인 콜백의 upsert(ignoreDuplicates) 는 INSERT 만 쓴다. 그 한 가지 모양만 허용한다.
      const policy = lastCreatePolicy("profiles_insert_own");

      expect(policy).toMatch(/for\s+insert/i);
      expect(policy).toMatch(/to\s+authenticated/i);
      expect(policy).toMatch(/user_id\s*=\s*auth\.uid\s*\(\s*\)/i);
      expect(policy).toMatch(/subscription_status\s*=\s*'trialing'/i);
      expect(policy).toMatch(/polar_customer_id\s+is\s+null/i);
      expect(policy).toMatch(/current_period_end\s+is\s+null/i);
      // 체험 시작 시각을 미래로 넣어 체험을 늘리지 못하게 한다.
      expect(policy).toMatch(/trial_started_at\s*<=\s*now\s*\(\s*\)/i);
    });
  });

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

  it("caps upload size and mime types on the bucket itself", () => {
    // 서명 URL 발급 라우트가 검사하는 size·contentType 은 클라이언트 자기신고다.
    // 실제 업로드는 Storage 로 직행하므로 버킷에 제한이 없으면 방어가 없다.
    const bucketStatements = [
      ...migrationSql.matchAll(/insert\s+into\s+storage\.buckets[\s\S]*?;/gi),
    ]
      .map((match) => match[0])
      .join(" ")
      .replace(/\s+/g, " ");

    expect(bucketStatements).toMatch(/file_size_limit/i);
    expect(bucketStatements).toMatch(/allowed_mime_types/i);
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
