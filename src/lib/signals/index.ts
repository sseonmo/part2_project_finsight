import { detectCategorySpike } from "./detect-category-spike";
import { detectNewMerchantLarge } from "./detect-new-merchant-large";
import { detectOutlierTransaction } from "./detect-outlier-transaction";
import { detectRecurring } from "./detect-recurring";
import type { DetectSignalsInput, Signal } from "./types";

export type {
  CategoryAmountMedian,
  CategoryMonthlyTotal,
  DetectSignalsInput,
  Signal,
  SignalTransaction,
  SignalType,
} from "./types";
export {
  SIGNAL_CONDITION_COPY,
  SIGNAL_THRESHOLDS,
  SIGNAL_TYPES,
} from "./thresholds";

function sortSignals(signals: readonly Signal[]): Signal[] {
  const impactSignals = signals
    .filter((signal) => signal.impact !== null)
    .sort((left, right) => (right.impact ?? 0) - (left.impact ?? 0));
  const nullImpactSignals = signals.filter((signal) => signal.impact === null);

  return [...impactSignals, ...nullImpactSignals];
}

export function detectSignals(input: DetectSignalsInput): Signal[] {
  const outlierSignals = detectOutlierTransaction({
    period: input.currentPeriod,
    transactions: input.transactions,
  });

  if (!input.previousPeriod) {
    return sortSignals(outlierSignals);
  }

  const recurringSignals = detectRecurring({
    transactions: input.merchantHistory,
  }).filter((signal) => signal.period === input.currentPeriod);

  return sortSignals([
    ...detectCategorySpike({
      previousPeriod: input.previousPeriod,
      currentPeriod: input.currentPeriod,
      totals: input.categoryMonthlyTotals,
    }),
    ...detectNewMerchantLarge({
      period: input.currentPeriod,
      transactions: input.transactions,
      medians: input.categoryMedians,
      seenMerchants: input.seenMerchants,
    }),
    ...outlierSignals,
    ...recurringSignals,
  ]);
}
