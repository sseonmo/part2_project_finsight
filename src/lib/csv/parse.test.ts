import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { hashHeader, parseCsv } from "./parse";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fixtureText(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

describe("csv parse", () => {
  it("parses headers, quoted commas, and CRLF rows", () => {
    const result = parseCsv(
      '승인일,가맹점명,금액,상태\r\n2026-03-04,"스타벅스, 강남점","5,100",승인\r\n',
    );

    expect(result.header).toEqual(["승인일", "가맹점명", "금액", "상태"]);
    expect(result.rows).toEqual([
      ["2026-03-04", "스타벅스, 강남점", "5,100", "승인"],
    ]);
  });

  it("keeps header-only CSV files distinguishable from unreadable files", () => {
    const result = parseCsv(fixtureText("header-only.csv"));

    expect(result.header).toEqual(["승인일", "가맹점명", "금액", "상태"]);
    expect(result.rows).toEqual([]);
  });

  it("hashes normalized headers deterministically", () => {
    const base = hashHeader(["\uFEFF 승인일 ", "가맹점명", "금액", "상태"]);
    const normalized = hashHeader(["승인일", "가맹점명", "금액", "상태"]);
    const cased = hashHeader([" DATE ", "Merchant", "Amount"]);
    const lower = hashHeader(["date", "merchant", "amount"]);

    expect(base).toBe(normalized);
    expect(cased).toBe(lower);
    expect(base).not.toBe(hashHeader(["승인일", "금액", "가맹점명", "상태"]));
    expect(base).toMatch(/^[a-f0-9]{64}$/);
  });
});
