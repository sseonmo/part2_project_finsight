import { describe, expect, it } from "vitest";

import { resolveReportStats, type ReportSnapshot } from "./snapshot";

const SNAPSHOT: ReportSnapshot = {
  totalExpense: 289_150,
  previousTotalExpense: 350_250,
  transactionCount: 14,
};

const CURRENT = { totalExpense: 345_150, transactionCount: 16 };
const PREVIOUS = { totalExpense: 350_250, transactionCount: 16 };

describe("report stats snapshot", () => {
  it("renders the snapshot the narrative was written from", () => {
    // 상단이 최신 집계이고 문단이 옛 스냅샷이면 한 화면에 총지출이 둘이 된다.
    const resolved = resolveReportStats({
      snapshot: SNAPSHOT,
      current: CURRENT,
      previous: PREVIOUS,
    });

    expect(resolved.stats).toEqual(SNAPSHOT);
  });

  it("flags that transactions changed after the report was generated", () => {
    const resolved = resolveReportStats({
      snapshot: SNAPSHOT,
      current: CURRENT,
      previous: PREVIOUS,
    });

    expect(resolved.isStale).toBe(true);
  });

  it("does not flag staleness while the data still matches the snapshot", () => {
    const resolved = resolveReportStats({
      snapshot: SNAPSHOT,
      current: { totalExpense: 289_150, transactionCount: 14 },
      previous: PREVIOUS,
    });

    expect(resolved.isStale).toBe(false);
  });

  it("flags staleness when the previous month total moved too", () => {
    // 지난달 명세서를 나중에 올리면 전월 대비만 바뀐다. 그것도 문단이 쓴
    // 비교와 어긋나므로 알려야 한다.
    const resolved = resolveReportStats({
      snapshot: SNAPSHOT,
      current: { totalExpense: 289_150, transactionCount: 14 },
      previous: { totalExpense: 401_000, transactionCount: 18 },
    });

    expect(resolved.isStale).toBe(true);
  });

  it("falls back to the live aggregate for reports saved before snapshots existed", () => {
    const resolved = resolveReportStats({
      snapshot: null,
      current: CURRENT,
      previous: PREVIOUS,
    });

    expect(resolved.stats).toEqual({
      totalExpense: 345_150,
      previousTotalExpense: 350_250,
      transactionCount: 16,
    });
    expect(resolved.isStale).toBe(false);
  });

  it("keeps the previous month null when that month has no transactions", () => {
    const resolved = resolveReportStats({
      snapshot: null,
      current: CURRENT,
      previous: { totalExpense: 0, transactionCount: 0 },
    });

    expect(resolved.stats.previousTotalExpense).toBeNull();
  });

  it("treats a snapshot without a prior month as unchanged when there is still none", () => {
    const resolved = resolveReportStats({
      snapshot: { ...SNAPSHOT, previousTotalExpense: null },
      current: { totalExpense: 289_150, transactionCount: 14 },
      previous: { totalExpense: 0, transactionCount: 0 },
    });

    expect(resolved.isStale).toBe(false);
  });
});
