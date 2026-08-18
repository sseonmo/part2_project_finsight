import type { SignalType } from "./types";
export type { SignalType } from "./types";
export { SIGNAL_TYPES } from "./types";

export const SIGNAL_THRESHOLDS = {
  categorySpike: { minIncreaseRatio: 0.5, minIncreaseKrw: 30_000 },
  newMerchantLarge: { medianMultiple: 3, minAmountKrw: 50_000 },
  outlierTransaction: {
    minShareOfCategory: 0.3,
    minAmountKrw: 50_000,
    minCategoryMonthlyKrw: 100_000,
  },
  recurring: {
    amountTolerance: 0.1,
    minIntervalDays: 25,
    maxIntervalDays: 35,
    minOccurrences: 3,
  },
  recurringPriceUp: { minIncreaseRatio: 0.1, impactMonths: 12 },
} as const;

function formatKrw(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

const categorySpike = SIGNAL_THRESHOLDS.categorySpike;
const newMerchantLarge = SIGNAL_THRESHOLDS.newMerchantLarge;
const outlierTransaction = SIGNAL_THRESHOLDS.outlierTransaction;
const recurring = SIGNAL_THRESHOLDS.recurring;
const recurringPriceUp = SIGNAL_THRESHOLDS.recurringPriceUp;

export const SIGNAL_CONDITION_COPY: Record<SignalType, string> = {
  category_spike: `전월 대비 ${formatPercent(categorySpike.minIncreaseRatio)} 이상 늘고 증가액이 ${formatKrw(categorySpike.minIncreaseKrw)} 이상인 카테고리만 잡습니다.`,
  new_merchant_large: `이전에 보지 못한 가맹점의 결제가 해당 카테고리 중앙값의 ${newMerchantLarge.medianMultiple}배 이상이고 ${formatKrw(newMerchantLarge.minAmountKrw)} 이상일 때만 잡습니다.`,
  outlier_transaction: `단일 결제가 그 카테고리 월 지출의 ${formatPercent(outlierTransaction.minShareOfCategory)} 이상이고, 결제액은 ${formatKrw(outlierTransaction.minAmountKrw)} 이상이며, 카테고리 월 지출도 ${formatKrw(outlierTransaction.minCategoryMonthlyKrw)} 이상일 때만 잡습니다.`,
  recurring_payment: `금액 편차가 ${formatPercent(recurring.amountTolerance)} 이내이고 결제 간격이 ${recurring.minIntervalDays}~${recurring.maxIntervalDays}일이며 ${recurring.minOccurrences}회 이상, 모든 달에 월 1건씩 있는 결제만 반복 결제로 봅니다.`,
  recurring_price_up: `반복 결제 조건을 만족하면서 최근 결제액이 직전 결제액보다 ${formatPercent(recurringPriceUp.minIncreaseRatio)} 이상 오르면, 인상분을 ${recurringPriceUp.impactMonths}개월로 환산해 영향도를 계산합니다.`,
};

export const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  category_spike: "카테고리 급증",
  new_merchant_large: "새 가맹점 큰 결제",
  outlier_transaction: "이상 결제",
  recurring_payment: "반복 결제",
  recurring_price_up: "구독료 인상",
};
