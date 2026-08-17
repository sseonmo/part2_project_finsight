import { SIGNAL_THRESHOLDS } from "./thresholds";
import type { CategoryMonthlyTotal, Signal } from "./types";

export function detectCategorySpike(input: {
  previousPeriod: string;
  currentPeriod: string;
  totals: readonly CategoryMonthlyTotal[];
}): Signal[] {
  const previousByCategory = new Map(
    input.totals
      .filter((total) => total.period === input.previousPeriod)
      .map((total) => [total.category, total]),
  );
  const thresholds = SIGNAL_THRESHOLDS.categorySpike;
  const signals: Signal[] = [];

  for (const current of input.totals) {
    if (current.period !== input.currentPeriod) {
      continue;
    }

    const previous = previousByCategory.get(current.category);

    if (!previous || previous.totalAmount <= 0) {
      continue;
    }

    const increaseAmount = current.totalAmount - previous.totalAmount;
    const increaseRatio = increaseAmount / previous.totalAmount;

    if (
      increaseRatio < thresholds.minIncreaseRatio ||
      increaseAmount < thresholds.minIncreaseKrw
    ) {
      continue;
    }

    signals.push({
      type: "category_spike",
      period: input.currentPeriod,
      targetKey: current.category,
      impact: increaseAmount,
      payload: {
        category: current.category,
        previousPeriod: input.previousPeriod,
        currentPeriod: input.currentPeriod,
        previousTotal: previous.totalAmount,
        currentTotal: current.totalAmount,
        increaseAmount,
        increaseRatio,
        previousTransactionCount: previous.transactionCount,
        currentTransactionCount: current.transactionCount,
      },
    });
  }

  return signals;
}
