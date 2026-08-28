import { CATEGORY_TOKENS, type Category } from "@/lib/categories";
import {
  formatKrw,
  formatPercent,
  SIGNAL_THRESHOLDS,
  type SignalType,
} from "@/lib/signals/thresholds";

export type SentencePart =
  | { kind: "text"; text: string }
  | { kind: "mark"; text: string; evidence: string };

export type RawRow = { key: string; value: string; pass?: boolean };

export type EvidenceRow = { date: string; merchant: string; amount: string };

export type LandingInsightCard = {
  id: string;
  type: SignalType;
  category: Category;
  subject: string;
  impact: string;
  sentence: readonly SentencePart[];
  raw: readonly RawRow[];
  source: string;
  evidence: {
    title: string;
    rows: readonly EvidenceRow[];
    summaryLabel: string;
    summaryValue: string;
  };
};

export type LandingCsvRow = { text: string; signalId: string };

export type LandingSignalRow = {
  signalId: string;
  category: Category;
  name: string;
  amount: string;
};

export type LandingSignalTile = { type: SignalType; condition: string };

/** 카테고리 색을 인라인 style 에 넣을 수 있는 형태로 바꾼다. */
export function categoryVar(category: Category): string {
  return `var(${CATEGORY_TOKENS[category]})`;
}

const spike = SIGNAL_THRESHOLDS.categorySpike;
const merchant = SIGNAL_THRESHOLDS.newMerchantLarge;
const outlier = SIGNAL_THRESHOLDS.outlierTransaction;
const recurring = SIGNAL_THRESHOLDS.recurring;
const priceUp = SIGNAL_THRESHOLDS.recurringPriceUp;

/** `SIGNAL_CONDITION_COPY` 는 리포트용 완결 문장이라 타일에는 길다. 타일은 조건만 짧게 끊되
    숫자는 같은 출처에서 읽는다 — 임계값이 바뀌면 랜딩도 따라 바뀌어야 한다. */
export const LANDING_SIGNAL_TILES = [
  {
    type: "recurring_price_up",
    condition: `반복 결제가 직전보다 ${formatPercent(priceUp.minIncreaseRatio)} 이상 오르면 인상분을 ${priceUp.impactMonths}개월로 환산합니다. 가장 놓치기 쉽고, 가장 오래 새는 항목입니다.`,
  },
  {
    type: "category_spike",
    condition: `전월 대비 ${formatPercent(spike.minIncreaseRatio)} 이상 늘고 증가액이 ${formatKrw(spike.minIncreaseKrw)} 이상`,
  },
  {
    type: "outlier_transaction",
    condition: `한 건이 그 카테고리 월 지출의 ${formatPercent(outlier.minShareOfCategory)} 이상`,
  },
  {
    type: "new_merchant_large",
    condition: `처음 보는 곳에서 카테고리 중앙값의 ${merchant.medianMultiple}배 이상`,
  },
  {
    type: "recurring_payment",
    condition: `${recurring.minIntervalDays}~${recurring.maxIntervalDays}일 간격으로 ${recurring.minOccurrences}회 이상 같은 금액`,
  },
] as const satisfies readonly LandingSignalTile[];

export const LANDING_INSIGHT_CARDS = [
  {
    id: "cafe",
    type: "category_spike",
    category: "카페/간식",
    subject: "카페/간식 · 2026년 3월",
    impact: "+62,000원",
    sentence: [
      { kind: "text", text: "카페·간식이 지난달보다 " },
      {
        kind: "mark",
        text: "62,000원(+58%)",
        evidence: "거래 12건을 더한 값 · 106,000원 → 168,000원",
      },
      { kind: "text", text: " 늘었습니다." },
    ],
    raw: [
      { key: "signal", value: "category_spike" },
      { key: "target", value: "카페/간식" },
      { key: "prev", value: "106,000" },
      { key: "current", value: "168,000" },
      { key: "impact", value: "62000" },
      {
        key: "threshold",
        pass: true,
        value: `+58% ≥ ${formatPercent(spike.minIncreaseRatio)} ✓ · 62,000 ≥ ${spike.minIncreaseKrw.toLocaleString("ko-KR")} ✓`,
      },
    ] as readonly RawRow[],
    source: "src/lib/signals/detect-category-spike.ts",
    evidence: {
      title: "이 금액을 만든 거래",
      rows: [
        { date: "03.04", merchant: "블루보틀 성수", amount: "6,800원" },
        { date: "03.05", merchant: "스타벅스 역삼", amount: "5,100원" },
        { date: "03.08", merchant: "메가커피 삼성", amount: "2,000원" },
        { date: "03.11", merchant: "투썸플레이스 삼성", amount: "6,500원" },
        { date: "03.14", merchant: "블루보틀 성수", amount: "6,800원" },
      ],
      summaryLabel: "외 7건 합계",
      summaryValue: "168,000원",
    },
  },
  {
    id: "sub",
    type: "recurring_price_up",
    category: "주거/통신",
    subject: "주거/통신 · 스트리밍 구독",
    impact: "연 36,000원",
    sentence: [
      { kind: "text", text: "구독료가 " },
      {
        kind: "mark",
        text: "9,900원에서 12,900원",
        evidence: "직전 결제 대비 +30.3% · 최근 4회 결제에서 확인",
      },
      {
        kind: "text",
        text: "으로 올랐습니다. 이대로면 1년에 그만큼 더 내게 됩니다.",
      },
    ],
    raw: [
      { key: "signal", value: "recurring_price_up" },
      { key: "target", value: "스트리밍 구독" },
      { key: "prev_amount", value: "9,900" },
      { key: "curr_amount", value: "12,900" },
      {
        key: "impact",
        value: `36000 (3,000 × ${priceUp.impactMonths}개월)`,
      },
      {
        key: "threshold",
        pass: true,
        value: `+30.3% ≥ ${formatPercent(priceUp.minIncreaseRatio)} ✓`,
      },
    ] as readonly RawRow[],
    source: "src/lib/signals/detect-recurring.ts",
    evidence: {
      title: "반복 결제 이력",
      rows: [
        { date: "12.02", merchant: "스트리밍 구독", amount: "9,900원" },
        { date: "01.02", merchant: "스트리밍 구독", amount: "9,900원" },
        { date: "02.02", merchant: "스트리밍 구독", amount: "9,900원" },
        { date: "03.02", merchant: "스트리밍 구독", amount: "12,900원" },
      ],
      summaryLabel: `간격 ${recurring.minIntervalDays}~31일 · 4회`,
      summaryValue: "+3,000원",
    },
  },
  {
    id: "outlier",
    type: "outlier_transaction",
    category: "문화/여가",
    subject: "문화/여가 · 단일 결제",
    impact: "180,000원",
    sentence: [
      { kind: "text", text: "결제 한 건이 그 달 문화·여가 지출의 " },
      {
        kind: "mark",
        text: "44%",
        evidence: "180,000원 ÷ 문화·여가 409,000원",
      },
      { kind: "text", text: "를 차지했습니다." },
    ],
    raw: [
      { key: "signal", value: "outlier_transaction" },
      { key: "target", value: "문화/여가 · 1건" },
      { key: "amount", value: "180,000" },
      { key: "cat_month", value: "409,000" },
      { key: "share", value: "0.44" },
      {
        key: "threshold",
        pass: true,
        value: `44% ≥ ${formatPercent(outlier.minShareOfCategory)} ✓ · 180,000 ≥ ${outlier.minAmountKrw.toLocaleString("ko-KR")} ✓`,
      },
    ] as readonly RawRow[],
    source: "src/lib/signals/detect-outlier-transaction.ts",
    evidence: {
      title: "해당 결제",
      rows: [
        { date: "03.06", merchant: "메가박스 코엑스", amount: "180,000원" },
        { date: "03.12", merchant: "예스24 공연", amount: "88,000원" },
        { date: "03.19", merchant: "교보문고", amount: "34,000원" },
        { date: "03.24", merchant: "넷플릭스", amount: "12,900원" },
      ],
      summaryLabel: "문화/여가 3월 합계",
      summaryValue: "409,000원",
    },
  },
] as const satisfies readonly LandingInsightCard[];

export const LANDING_CSV_ROWS = [
  { text: "2026-03-01,스타벅스 역삼,5100", signalId: "cafe" },
  { text: "2026-03-01,GS25 역삼점,3200", signalId: "" },
  { text: "2026-03-02,스트리밍 구독,12900", signalId: "sub" },
  { text: "2026-03-02,배달의민족,23000", signalId: "" },
  { text: "2026-03-03,서울교통공사,1400", signalId: "" },
  { text: "2026-03-04,블루보틀 성수,6800", signalId: "cafe" },
  { text: "2026-03-06,메가박스 코엑스,180000", signalId: "outlier" },
  { text: "2026-03-08,메가커피 삼성,2000", signalId: "cafe" },
  { text: "2026-03-09,올리브영,31900", signalId: "" },
] as const satisfies readonly LandingCsvRow[];

export const LANDING_SIGNAL_ROWS = [
  {
    signalId: "sub",
    category: "주거/통신",
    name: "구독료가 3,000원 올랐습니다",
    amount: "연 36,000원",
  },
  {
    signalId: "cafe",
    category: "카페/간식",
    name: "카페·간식이 58% 늘었습니다",
    amount: "+62,000원",
  },
  {
    signalId: "outlier",
    category: "문화/여가",
    name: "한 건이 그 달의 44%",
    amount: "180,000원",
  },
] as const satisfies readonly LandingSignalRow[];

export const LANDING_DASHBOARD = {
  period: "2026년 3월 · 대시보드",
  total: "1,136,000원",
  delta: "지난달보다 +8.2%",
  donutTotal: "114만원",
  bars: [
    { category: "식비", amount: "382,000원", share: 100 },
    { category: "쇼핑", amount: "214,000원", share: 56 },
    { category: "카페/간식", amount: "168,000원", share: 44 },
    { category: "교통", amount: "146,000원", share: 38 },
    { category: "주거/통신", amount: "128,000원", share: 34 },
    { category: "기타", amount: "98,000원", share: 26 },
  ],
} as const satisfies {
  period: string;
  total: string;
  delta: string;
  donutTotal: string;
  bars: readonly { category: Category; amount: string; share: number }[];
};
