import {
  compareByDate,
  daysBetween,
  isEligibleTransaction,
  monthIndex,
  monthStartFromDate,
} from "./helpers";
import { SIGNAL_THRESHOLDS } from "./thresholds";
import type { Signal, SignalTransaction } from "./types";

function groupByMerchant(
  transactions: readonly SignalTransaction[],
): Map<string, SignalTransaction[]> {
  const groups = new Map<string, SignalTransaction[]>();

  for (const transaction of transactions) {
    if (!isEligibleTransaction(transaction)) {
      continue;
    }

    const existing = groups.get(transaction.merchantNormalized) ?? [];
    existing.push(transaction);
    groups.set(transaction.merchantNormalized, existing);
  }

  return groups;
}

function intervalDays(transactions: readonly SignalTransaction[]): number[] {
  const intervals: number[] = [];

  for (let index = 1; index < transactions.length; index += 1) {
    const previous = transactions[index - 1];
    const current = transactions[index];

    if (!previous || !current) {
      continue;
    }

    intervals.push(daysBetween(previous.transactedOn, current.transactedOn));
  }

  return intervals;
}

function hasRecurringIntervals(intervals: readonly number[]): boolean {
  const thresholds = SIGNAL_THRESHOLDS.recurring;

  return intervals.every(
    (interval) =>
      interval >= thresholds.minIntervalDays &&
      interval <= thresholds.maxIntervalDays,
  );
}

function hasOnePaymentPerContiguousMonth(
  transactions: readonly SignalTransaction[],
): boolean {
  const monthCounts = new Map<string, number>();

  for (const transaction of transactions) {
    const month = monthStartFromDate(transaction.transactedOn);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  }

  if ([...monthCounts.values()].some((count) => count !== 1)) {
    return false;
  }

  const first = transactions[0];
  const last = transactions.at(-1);

  if (!first || !last) {
    return false;
  }

  const expectedMonthCount =
    monthIndex(monthStartFromDate(last.transactedOn)) -
    monthIndex(monthStartFromDate(first.transactedOn)) +
    1;

  return expectedMonthCount === monthCounts.size;
}

function isWithinAmountTolerance(amounts: readonly number[]): boolean {
  const baseline = amounts[0];

  if (!baseline || baseline <= 0) {
    return false;
  }

  const tolerance = SIGNAL_THRESHOLDS.recurring.amountTolerance;

  return amounts.every(
    (amount) => Math.abs(amount - baseline) / baseline <= tolerance,
  );
}

function buildRecurringPayment(
  merchant: string,
  transactions: readonly SignalTransaction[],
  intervals: readonly number[],
): Signal {
  const amounts = transactions.map((transaction) => transaction.amount);
  const latest = transactions.at(-1);

  if (!latest) {
    throw new Error("Recurring payment requires at least one transaction.");
  }

  return {
    type: "recurring_payment",
    period: monthStartFromDate(latest.transactedOn),
    targetKey: merchant,
    impact: null,
    payload: {
      merchantNormalized: merchant,
      firstTransactedOn: transactions[0]?.transactedOn,
      lastTransactedOn: latest.transactedOn,
      occurrenceCount: transactions.length,
      monthCount: transactions.length,
      latestAmount: latest.amount,
      minAmount: Math.min(...amounts),
      maxAmount: Math.max(...amounts),
      intervalDays: intervals,
    },
  };
}

function buildPriceUpSignal(
  merchant: string,
  transactions: readonly SignalTransaction[],
): Signal | null {
  const previousTransactions = transactions.slice(0, -1);
  const previousAmounts = previousTransactions.map(
    (transaction) => transaction.amount,
  );
  const latest = transactions.at(-1);
  const previous = previousTransactions.at(-1);

  if (
    previousAmounts.length === 0 ||
    !latest ||
    !previous ||
    !isWithinAmountTolerance(previousAmounts)
  ) {
    return null;
  }

  const increaseAmount = latest.amount - previous.amount;
  const increaseRatio = increaseAmount / previous.amount;
  const thresholds = SIGNAL_THRESHOLDS.recurringPriceUp;

  if (increaseAmount <= 0 || increaseRatio < thresholds.minIncreaseRatio) {
    return null;
  }

  const impact = increaseAmount * thresholds.impactMonths;

  return {
    type: "recurring_price_up",
    period: monthStartFromDate(latest.transactedOn),
    targetKey: merchant,
    impact,
    payload: {
      merchantNormalized: merchant,
      previousAmount: previous.amount,
      latestAmount: latest.amount,
      increaseAmount,
      increaseRatio,
      annualizedImpact: impact,
      previousTransactedOn: previous.transactedOn,
      latestTransactedOn: latest.transactedOn,
      occurrenceCount: transactions.length,
    },
  };
}

export function detectRecurring(input: {
  transactions: readonly SignalTransaction[];
}): Signal[] {
  const signals: Signal[] = [];
  const groups = groupByMerchant(input.transactions);
  const thresholds = SIGNAL_THRESHOLDS.recurring;

  for (const [merchant, merchantTransactions] of groups) {
    const transactions = [...merchantTransactions].sort(compareByDate);

    if (transactions.length < thresholds.minOccurrences) {
      continue;
    }

    const intervals = intervalDays(transactions);

    if (
      !hasRecurringIntervals(intervals) ||
      !hasOnePaymentPerContiguousMonth(transactions)
    ) {
      continue;
    }

    if (
      isWithinAmountTolerance(
        transactions.map((transaction) => transaction.amount),
      )
    ) {
      signals.push(buildRecurringPayment(merchant, transactions, intervals));
    }

    const priceUpSignal = buildPriceUpSignal(merchant, transactions);

    if (priceUpSignal) {
      signals.push(priceUpSignal);
    }
  }

  return signals;
}
