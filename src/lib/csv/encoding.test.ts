import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { decodeCsv, detectEncoding, type DetectedEncoding } from "./encoding";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURE_DIR, name)));
}

describe("csv encoding", () => {
  it.each([
    ["utf8-bom.csv", "utf-8"],
    ["euc-kr.csv", "euc-kr"],
    ["cp949.csv", "cp949"],
  ] satisfies Array<[string, DetectedEncoding]>)(
    "detects and decodes %s",
    (name, expectedEncoding) => {
      const bytes = fixtureBytes(name);

      expect(detectEncoding(bytes)).toBe(expectedEncoding);
      expect(decodeCsv(bytes)).toEqual({
        encoding: expectedEncoding,
        text: expect.stringContaining("승인일,가맹점명,금액,상태"),
      });
    },
  );

  it("removes a UTF-8 BOM from decoded text", () => {
    const decoded = decodeCsv(fixtureBytes("utf8-bom.csv"));

    expect(decoded.text.startsWith("\uFEFF")).toBe(false);
    expect(decoded.text.split(/\r?\n/)[0]).toBe("승인일,가맹점명,금액,상태");
  });
});
