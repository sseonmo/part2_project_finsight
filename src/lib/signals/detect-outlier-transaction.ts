import { isEligibleTransaction } from "./helpers";
import { SIGNAL_THRESHOLDS } from "./thresholds";
import type { Signal, SignalTransaction } from "./types";

export function detectOutlierTransaction(input: {
  period: string;
  transactions: readonly SignalTransaction[];
}): Signal[] {
  const transactions = input.transactions.filter(
    (transaction) =>
      transaction.period === input.period && isEligibleTransaction(transaction),
  );
  const totalByCategory = new Map<string, number>();
  const thresholds = SIGNAL_THRESHOLDS.outlierTransaction;

  for (const transaction of transactions) {
    totalByCategory.set(
      transaction.category,
      (totalByCategory.get(transaction.category) ?? 0) + transaction.amount,
    );
  }

  const signals: Signal[] = [];

  for (const transaction of transactions) {
    const categoryTotal = totalByCategory.get(transaction.category) ?? 0;
    const shareOfCategory = transaction.amount / categoryTotal;

    if (
      categoryTotal < thresholds.minCategoryMonthlyKrw ||
      transaction.amount < thresholds.minAmountKrw ||
      shareOfCategory < thresholds.minShareOfCategory
    ) {
      continue;
    }

    signals.push({
      type: "outlier_transaction",
      period: input.period,
      targetKey: transaction.id,
      impact: transaction.amount,
      payload: {
        transactionId: transaction.id,
        transactedOn: transaction.transactedOn,
        merchantNormalized: transaction.merchantNormalized,
        category: transaction.category,
        amount: transaction.amount,
        categoryTotal,
        shareOfCategory,
      },
    });
  }

  return signals;
}
