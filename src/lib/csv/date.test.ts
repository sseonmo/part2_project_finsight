import { describe, expect, it } from "vitest";

import { decideDateFormat, parseDate } from "./date";

describe("csv date", () => {
  it("parses ISO dates at Asia/Seoul midnight", () => {
    const parsed = parseDate("2026-03-04", "YYYY-MM-DD");

    expect(parsed?.toISOString()).toBe("2026-03-03T15:00:00.000Z");
  });

  it("uses the whole file to decide MM/DD/YYYY", () => {
    const dates = [
      ...Array.from({ length: 20 }, () => "03/04/2026"),
      "03/14/2026",
    ];

    expect(decideDateFormat(dates)).toEqual({
      format: "MM/DD/YYYY",
      ambiguousResolvedBy: "scan",
    });
    expect(parseDate("03/04/2026", "MM/DD/YYYY")?.toISOString()).toBe(
      "2026-03-03T15:00:00.000Z",
    );
  });

  it("uses the whole file to decide DD/MM/YYYY", () => {
    const dates = [
      ...Array.from({ length: 20 }, () => "03/04/2026"),
      "14/03/2026",
    ];

    expect(decideDateFormat(dates)).toEqual({
      format: "DD/MM/YYYY",
      ambiguousResolvedBy: "scan",
    });
    expect(parseDate("03/04/2026", "DD/MM/YYYY")?.toISOString()).toBe(
      "2026-04-02T15:00:00.000Z",
    );
  });

  it("marks fully ambiguous numeric dates as assumed", () => {
    expect(decideDateFormat(["03/04/2026", "04/05/2026"])).toEqual({
      format: "MM/DD/YYYY",
      ambiguousResolvedBy: "assumed-iso",
    });
  });

  it("returns null for impossible dates", () => {
    expect(parseDate("2026-02-30", "YYYY-MM-DD")).toBeNull();
    expect(parseDate("13/04/2026", "MM/DD/YYYY")).toBeNull();
  });

  it("uses MM/DD evidence in files that carry two-digit years", () => {
    expect(decideDateFormat(["03/04/26", "03/14/26"])).toEqual({
      format: "MM/DD/YYYY",
      ambiguousResolvedBy: "scan",
    });
    expect(parseDate("03/14/26", "MM/DD/YYYY")?.toISOString()).toBe(
      "2026-03-13T15:00:00.000Z",
    );
  });

  it("reads a month of YY.MM.DD rows as year-first", () => {
    // 한국 카드사에서 흔한 형식. 26 을 '일'로 읽으면 26.08.18 이 2018-08-26 이 된다.
    // 첫 성분이 한 값으로 고정되고 셋째 성분이 여러 값이면 앞이 연도다.
    const decision = decideDateFormat(["26.08.18", "26.08.19", "26.08.20"]);

    expect(decision).toEqual({
      format: "YY.MM.DD",
      ambiguousResolvedBy: "scan",
    });
    expect(parseDate("26.08.18", decision.format)?.toISOString()).toBe(
      "2026-08-17T15:00:00.000Z",
    );
  });

  it("keeps rejecting YY.MM.DD when the file cannot settle the year position", () => {
    // 한 행뿐이면 무엇이 고정이고 무엇이 변동인지 알 수 없다. 추측해서 8년
    // 어긋난 값을 적재하느니 반려한다.
    const decision = decideDateFormat(["26.08.18"]);

    expect(decision.format).not.toBe("YY.MM.DD");
    expect(parseDate("26.08.18", decision.format)).toBeNull();
  });

  it("does not mistake a month of MM/DD/YY rows for year-first", () => {
    // 여기서는 셋째 성분(26)이 고정이고 둘째가 변한다 — 연도가 마지막이다.
    const decision = decideDateFormat(["08/18/26", "08/19/26", "08/20/26"]);

    expect(decision.format).not.toBe("YY.MM.DD");
    expect(parseDate("08/18/26", decision.format)?.toISOString()).toBe(
      "2026-08-17T15:00:00.000Z",
    );
  });

  it("does not read an out-of-range month as year-first", () => {
    const decision = decideDateFormat(["26.13.18", "26.13.19"]);

    expect(decision.format).not.toBe("YY.MM.DD");
  });

  it("still takes MM/DD evidence when the two-digit year is last", () => {
    expect(decideDateFormat(["03/04/26", "03/14/26"])).toEqual({
      format: "MM/DD/YYYY",
      ambiguousResolvedBy: "scan",
    });
  });

});
