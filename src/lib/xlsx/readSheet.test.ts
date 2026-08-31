import { describe, expect, it, vi } from "vitest";

import { readSheet } from "./readSheet";

const readXlsxFileMock = vi.hoisted(() => vi.fn());

vi.mock("read-excel-file/browser", () => ({
  default: readXlsxFileMock,
}));

describe("readSheet", () => {
  it("첫 시트의 행을 가공 없이 돌려준다", async () => {
    const data = [
      ["이용일자", "이용금액"],
      ["26.07.02", 6200],
    ];
    readXlsxFileMock.mockResolvedValue([{ sheet: "Sheet1", data }]);
    const file = new File(["fake"], "이용대금명세서.xlsx");

    await expect(readSheet(file)).resolves.toBe(data);
    expect(readXlsxFileMock).toHaveBeenCalledWith(file);
  });

  it("시트가 없으면 빈 배열을 돌려준다", async () => {
    readXlsxFileMock.mockResolvedValue([]);

    await expect(
      readSheet(new File(["fake"], "empty.xlsx")),
    ).resolves.toEqual([]);
  });
});
