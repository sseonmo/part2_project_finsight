import { describe, expect, it, vi } from "vitest";

import { readSheet } from "./readSheet";

const readXlsxFileMock = vi.hoisted(() => vi.fn());

vi.mock("read-excel-file", () => ({
  default: readXlsxFileMock,
}));

describe("readSheet", () => {
  it("파일을 파서에 그대로 넘기고 시트를 가공 없이 돌려준다", async () => {
    const sheet = [
      ["이용일자", "이용금액"],
      ["26.07.02", 6200],
    ];
    readXlsxFileMock.mockResolvedValue(sheet);
    const file = new File(["fake"], "이용대금명세서.xlsx");

    await expect(readSheet(file)).resolves.toBe(sheet);
    expect(readXlsxFileMock).toHaveBeenCalledWith(file);
  });
});
