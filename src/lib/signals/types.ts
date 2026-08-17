import type { Category } from "@/lib/categories";

export const SIGNAL_TYPES = [
  "category_spike",
  "new_merchant_large",
  "outlier_transaction",
  "recurring_payment",
  "recurring_price_up",
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export type Signal = {
  type: SignalType;
  period: string;
  targetKey: string;
  impact: number | null;
  payload: Record<string, unknown>;
};

export type CategoryMonthlyTotal = {
  period: string;
  category: Category;
  totalAmount: number;
  transactionCount: number;
};

export type SignalTransaction = {
  id: string;
  period: string;
  transactedOn: string;
  amount: number;
  category: Category;
  merchantNormalized: string;
  categoryFallback?: boolean;
};

export type CategoryAmountMedian = {
  period: string;
  category: Category;
  medianAmount: number;
};

export type DetectSignalsInput = {
  currentPeriod: string;
  previousPeriod?: string;
  categoryMonthlyTotals: readonly CategoryMonthlyTotal[];
  transactions: readonly SignalTransaction[];
  categoryMedians: readonly CategoryAmountMedian[];
  seenMerchants: readonly string[];
  merchantHistory: readonly SignalTransaction[];
};
