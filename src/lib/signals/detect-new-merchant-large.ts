import { isEligibleTransaction } from "./helpers";
import { SIGNAL_THRESHOLDS } from "./thresholds";
import type { CategoryAmountMedian, Signal, SignalTransaction } from "./types";

export function detectNewMerchantLarge(input: {
  period: string;
  transactions: readonly SignalTransaction[];
  medians: readonly CategoryAmountMedian[];
  seenMerchants: readonly string[];
}): Signal[] {
  const mediansByCategory = new Map(
    input.medians
      .filter((median) => median.period === input.period)
      .map((median) => [median.category, median.medianAmount]),
  );
  const seenMerchants = new Set(input.seenMerchants);
  const thresholds = SIGNAL_THRESHOLDS.newMerchantLarge;
  const candidateByMerchant = new Map<string, SignalTransaction>();

  for (const transaction of input.transactions) {
    if (
      transaction.period !== input.period ||
      !isEligibleTransaction(transaction) ||
      seenMerchants.has(transaction.merchantNormalized)
    ) {
      continue;
    }

    const medianAmount = mediansByCategory.get(transaction.category);

    if (
      medianAmount === undefined ||
      medianAmount <= 0 ||
      transaction.amount < thresholds.minAmountKrw ||
      transaction.amount < medianAmount * thresholds.medianMultiple
    ) {
      continue;
    }

    const existing = candidateByMerchant.get(transaction.merchantNormalized);

    if (!existing || transaction.amount > existing.amount) {
      candidateByMerchant.set(transaction.merchantNormalized, transaction);
    }
  }

  return [...candidateByMerchant.values()].map((transaction) => {
    const medianAmount = mediansByCategory.get(transaction.category) ?? 0;

    return {
      type: "new_merchant_large",
      period: input.period,
      targetKey: transaction.merchantNormalized,
      impact: transaction.amount,
      payload: {
        transactionId: transaction.id,
        transactedOn: transaction.transactedOn,
        merchantNormalized: transaction.merchantNormalized,
        category: transaction.category,
        amount: transaction.amount,
        medianAmount,
        medianMultiple: transaction.amount / medianAmount,
      },
    };
  });
}
