/**
 * 리포트 문단은 생성 시점의 집계로 쓰였다. 상단 통계를 실시간 집계로 그리면
 * 같은 화면에 총지출이 두 개가 된다(문단 289,150원 / 상단 345,150원).
 * 그래서 저장된 스냅샷을 그대로 그리고, 그 사이 거래가 바뀌었으면 알린다.
 */
export type ReportSnapshot = {
  totalExpense: number;
  previousTotalExpense: number | null;
  transactionCount: number;
};

type MonthAggregate = {
  totalExpense: number;
  transactionCount: number;
};

function livePreviousTotal(previous: MonthAggregate): number | null {
  return previous.transactionCount > 0 ? previous.totalExpense : null;
}

export function resolveReportStats(input: {
  snapshot: ReportSnapshot | null;
  current: MonthAggregate;
  previous: MonthAggregate;
}): { stats: ReportSnapshot; isStale: boolean } {
  const live: ReportSnapshot = {
    totalExpense: input.current.totalExpense,
    previousTotalExpense: livePreviousTotal(input.previous),
    transactionCount: input.current.transactionCount,
  };

  // 스냅샷 이전에 만들어진 리포트는 비교할 기준이 없다. 없는 경고를 띄우느니
  // 실시간 집계를 그대로 보여준다.
  if (!input.snapshot) {
    return { stats: live, isStale: false };
  }

  const isStale =
    input.snapshot.totalExpense !== live.totalExpense ||
    input.snapshot.transactionCount !== live.transactionCount ||
    input.snapshot.previousTotalExpense !== live.previousTotalExpense;

  return { stats: input.snapshot, isStale };
}
