# 랜딩 AI 인사이트 개편 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 랜딩 첫 화면에서 "규칙이 고르고 → SQL이 계산하고 → AI가 문장으로 옮긴다"는 분업을 직접 보여주는 인사이트 카드 스택으로 교체하고, 섹션을 5개에서 7개로 늘린다.

**Architecture:** 예시 데이터를 `src/lib/landing-samples.ts` 한 곳에 모으고(임계값 문구는 `SIGNAL_THRESHOLDS` 에서 파생), 섹션별 클라이언트 컴포넌트 6개를 `src/components/landing/` 에 만든 뒤 `page.tsx` 는 조립만 한다. CSS는 `globals.css` 의 `.landing-*` 구간에 추가하고 토큰 9개를 신설한다.

**Tech Stack:** Next.js 15 App Router · TypeScript strict · React 19 클라이언트 컴포넌트 · Vitest + Testing Library + jsdom · 순수 CSS(Tailwind 유틸 아님, `globals.css` 의 BEM 클래스)

**Spec:** `docs/superpowers/specs/2026-08-27-landing-ai-insight-design.md`

## Global Constraints

이 절의 규칙은 모든 태스크의 요구사항에 암묵적으로 포함된다.

- **`"AI가 분석해 드립니다"` 류 문구 금지.** 강조할 수 있는 것은 "AI가 문장으로 옮겨 준 지적"이지 "AI의 분석력"이 아니다 (`CLAUDE.md` CRITICAL: 신호 탐지는 결정론적 코드가 한다)
- **랜딩에 표시되는 임계값 숫자를 문자열로 박지 말 것.** 전부 `SIGNAL_THRESHOLDS` 에서 파생한다. 임계값이 바뀌면 랜딩 문구도 따라 바뀌어야 하고, 그러지 않으면 랜딩이 거짓말을 한다
- **새 색을 만들지 않는다.** 기존 `--cat-*` 10색과 기존 토큰만 쓴다
- **`--brand-yellow` 를 primary CTA 로 쓰지 않는다.** 랜딩에서 늘어나는 사용처는 숫자 하이라이트(`--landing-mark`) 하나뿐이다
- **CSS 클래스는 전부 `.landing-` 접두사.** `globals.css` 는 전역이므로 시안의 짧은 이름(`.hero` `.sec` `.icard`)을 그대로 쓰면 앱 화면과 충돌한다
- **모든 트랜지션은 `@media (prefers-reduced-motion: reduce)` 에서 꺼진다**
- **`--landing-max-width` 는 1040px**, 히어로는 카드가 아니다 (`docs/DESIGN.md`)
- **정본 3단계 문구를 바꾸지 않는다** — 랜딩·빈 대시보드·시작하기 카드가 같은 문구여야 한다 (`docs/UX_GUIDELINE.md` "계단은 하나다")
- **TDD.** 테스트를 먼저 쓰고, 실패를 확인하고, 통과시키는 최소 구현을 쓴다 (`CLAUDE.md` 개발 프로세스). `route.ts` 는 면제되지 않지만 이 작업에 라우트는 없다
- **커밋 메시지는 conventional commits**(`feat:` `fix:` `docs:` `refactor:`), 본문은 한국어 평서형. **push 는 사용자 지시 전에 하지 않는다**
- 검증 명령: `npm run test` · `npm run lint` · `npm run build`

## 배경: 이 개편이 뒤집는 기존 설계 2가지

실행자가 "기존 원칙과 어긋나는데?"로 멈추지 않도록 미리 밝힌다. 둘 다 의도된 변경이고 Task 10에서 `docs/DESIGN.md` 를 함께 고친다.

1. **섹션은 더 이상 카드가 아니다.** 지금 `.landing-section` 은 `--canvas` + `--hairline` + `--radius-xl` 카드다. 개편 후에는 `border-top: 1px solid var(--hairline-soft)` 구분선 + 상하 패딩만 남고, **카드는 섹션 안의 타일**(지적 5종 타일, 3단계 카드, 이유 카드, 요금제 카드)로 내려간다. 층이 한 단 깊어진다.
2. **그림자·모션·글로우가 `(marketing)` 에 한해 허용된다.** 앱 화면(`(app)/`)의 "그림자 거의 없음 · 등장 애니메이션 없음" 원칙은 그대로다.

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `src/lib/signals/thresholds.ts` | `formatKrw` · `formatPercent` 를 export 로 승격 | 수정(2줄) |
| `src/lib/landing-samples.ts` | 랜딩 예시 데이터 전부 + 임계값 파생 문구 | **신설** |
| `src/components/landing/LandingSection.tsx` | 섹션 껍데기(라벨·제목·리드·힌트) + 스크롤 진입 1회 | **신설** |
| `src/components/landing/Highlight.tsx` | I3 숫자 하이라이트 + 근거 툴팁 | **신설** |
| `src/components/landing/InsightCardStack.tsx` | ① 카드 스택 · I1 토글 · I2 뒤집기 · 자동 순환 | **신설** |
| `src/components/landing/CsvToSignals.tsx` | ② CSV ↔ 지적 I4 양방향 연결 | **신설** |
| `src/components/landing/SignalTypeGrid.tsx` | ③ 지적 5종 그리드 | **신설** |
| `src/components/landing/DashboardShowcase.tsx` | ⑤ 대시보드 + 떠 있는 인사이트 카드 | **신설** |
| `src/components/LandingStepPreview.tsx` | ④ 3단계 미리보기 — 3번째만 근거 패널로 교체 | 수정 |
| `src/app/(marketing)/page.tsx` | 조립 + OAuth (301줄 → ~160줄) | 수정 |
| `src/app/globals.css` | 토큰 9개 + `.landing-*` 규칙 | 수정 |
| `test/setup.ts` | `matchMedia` · `IntersectionObserver` 스텁 | 수정 |
| `docs/DESIGN.md` | "랜딩만 허용하는 표현" 절 신설 | 수정 |

**컴포넌트가 스펙의 5개가 아니라 6개인 이유:** 스펙에 없던 `LandingSection` 을 추가한다. ②~⑦ 여섯 섹션이 전부 같은 껍데기(라벨 → 제목 → 리드 → 본문)를 쓰고 스크롤 진입 관찰도 같다. 이걸 각 컴포넌트가 따로 하면 `IntersectionObserver` 설정이 여섯 번 복사된다.

**모두 클라이언트 컴포넌트다.** `page.tsx` 가 `useSearchParams` 때문에 `"use client"` 이고 그 아래는 전부 클라이언트에서 렌더된다. 훅을 쓰지 않는 컴포넌트라도 서버 컴포넌트가 아니다.

---

### Task 1: 랜딩 예시 데이터 (`landing-samples.ts`)

랜딩 화면에 나오는 모든 예시 숫자·문장·CSV 줄을 한 파일에 모은다. 임계값이 들어가는 문자열은 전부 `SIGNAL_THRESHOLDS` 에서 조립한다.

**Files:**
- Modify: `src/lib/signals/thresholds.ts` (`formatKrw`/`formatPercent` 앞에 `export` 추가)
- Create: `src/lib/landing-samples.ts`
- Test: `src/lib/landing-samples.test.ts`

**Interfaces:**
- Consumes: `SIGNAL_THRESHOLDS`, `SIGNAL_TYPES`, `SIGNAL_TYPE_LABELS`, `SignalType` (`@/lib/signals/thresholds`), `CATEGORY_TOKENS`, `Category` (`@/lib/categories`)
- Produces:
  - `type SentencePart = { kind: "text"; text: string } | { kind: "mark"; text: string; evidence: string }`
  - `type RawRow = { key: string; value: string; pass?: boolean }`
  - `type EvidenceRow = { date: string; merchant: string; amount: string }`
  - `type LandingInsightCard = { id: string; type: SignalType; category: Category; subject: string; impact: string; sentence: readonly SentencePart[]; raw: readonly RawRow[]; source: string; evidence: { title: string; rows: readonly EvidenceRow[]; summaryLabel: string; summaryValue: string } }`
  - `type LandingCsvRow = { text: string; signalId: string }`
  - `type LandingSignalRow = { signalId: string; category: Category; name: string; amount: string }`
  - `type LandingSignalTile = { type: SignalType; condition: string }`
  - `LANDING_INSIGHT_CARDS: readonly LandingInsightCard[]` (3장)
  - `LANDING_CSV_ROWS: readonly LandingCsvRow[]` (9줄)
  - `LANDING_SIGNAL_ROWS: readonly LandingSignalRow[]` (3건)
  - `LANDING_SIGNAL_TILES: readonly LandingSignalTile[]` (5종, `SIGNAL_TYPES` 순서 아님 — 아래 정의 순서)
  - `LANDING_DASHBOARD: { period: string; total: string; delta: string; donutTotal: string; bars: readonly { category: Category; amount: string; share: number }[] }`
  - `categoryVar(category: Category): string` — `"var(--cat-cafe-snack)"` 를 돌려준다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/landing-samples.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { CATEGORY_TOKENS } from "@/lib/categories";
import { SIGNAL_THRESHOLDS, SIGNAL_TYPES } from "@/lib/signals/thresholds";

import {
  categoryVar,
  LANDING_CSV_ROWS,
  LANDING_DASHBOARD,
  LANDING_INSIGHT_CARDS,
  LANDING_SIGNAL_ROWS,
  LANDING_SIGNAL_TILES,
} from "./landing-samples";

describe("landing samples", () => {
  it("covers every signal type exactly once in the tile grid", () => {
    const types = LANDING_SIGNAL_TILES.map((tile) => tile.type);

    expect(types).toHaveLength(SIGNAL_TYPES.length);
    expect(new Set(types)).toEqual(new Set(SIGNAL_TYPES));
  });

  it("derives tile conditions from the real thresholds instead of hardcoding", () => {
    const spike = LANDING_SIGNAL_TILES.find(
      (tile) => tile.type === "category_spike",
    );
    const recurring = LANDING_SIGNAL_TILES.find(
      (tile) => tile.type === "recurring_payment",
    );

    expect(spike?.condition).toContain("50%");
    expect(spike?.condition).toContain("30,000원");
    expect(recurring?.condition).toContain(
      `${SIGNAL_THRESHOLDS.recurring.minIntervalDays}~${SIGNAL_THRESHOLDS.recurring.maxIntervalDays}일`,
    );
    expect(recurring?.condition).toContain(
      `${SIGNAL_THRESHOLDS.recurring.minOccurrences}회`,
    );
  });

  it("shows the threshold comparison of each card as a passing raw row", () => {
    LANDING_INSIGHT_CARDS.forEach((card) => {
      const threshold = card.raw.find((row) => row.key === "threshold");

      expect(threshold?.pass).toBe(true);
      expect(threshold?.value).toContain("✓");
    });
  });

  it("keeps the category spike threshold row in sync with the thresholds file", () => {
    const card = LANDING_INSIGHT_CARDS.find(
      (item) => item.type === "category_spike",
    );
    const threshold = card?.raw.find((row) => row.key === "threshold");

    expect(threshold?.value).toContain("≥ 50%");
    expect(threshold?.value).toContain("≥ 30,000");
  });

  it("marks exactly one number span per insight sentence with its evidence", () => {
    LANDING_INSIGHT_CARDS.forEach((card) => {
      const marks = card.sentence.filter((part) => part.kind === "mark");

      expect(marks).toHaveLength(1);
      marks.forEach((mark) => {
        expect(mark.kind === "mark" && mark.evidence.length).toBeGreaterThan(0);
      });
    });
  });

  it("links every highlighted csv row to a signal row and vice versa", () => {
    const signalIds = new Set(LANDING_SIGNAL_ROWS.map((row) => row.signalId));
    const linkedCsvIds = new Set(
      LANDING_CSV_ROWS.map((row) => row.signalId).filter(Boolean),
    );

    expect(signalIds).toEqual(linkedCsvIds);
    expect(LANDING_CSV_ROWS).toHaveLength(9);
  });

  it("resolves category colors through the shared category tokens", () => {
    expect(categoryVar("카페/간식")).toBe(
      `var(${CATEGORY_TOKENS["카페/간식"]})`,
    );
    LANDING_DASHBOARD.bars.forEach((bar) => {
      expect(CATEGORY_TOKENS[bar.category]).toBeDefined();
      expect(bar.share).toBeGreaterThan(0);
      expect(bar.share).toBeLessThanOrEqual(100);
    });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/lib/landing-samples.test.ts`
Expected: FAIL — `Failed to resolve import "./landing-samples"`

- [ ] **Step 3: `thresholds.ts` 의 포맷 함수를 export 한다**

`src/lib/signals/thresholds.ts` 의 두 함수 선언 앞에 `export` 를 붙인다. 다른 변경은 하지 않는다.

```ts
export function formatKrw(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
```

- [ ] **Step 4: `landing-samples.ts` 를 쓴다**

```ts
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
export const LANDING_SIGNAL_TILES: readonly LandingSignalTile[] = [
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
] as const;

export const LANDING_INSIGHT_CARDS: readonly LandingInsightCard[] = [
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
    ],
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
    ],
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
    ],
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
] as const;

export const LANDING_CSV_ROWS: readonly LandingCsvRow[] = [
  { text: "2026-03-01,스타벅스 역삼,5100", signalId: "cafe" },
  { text: "2026-03-01,GS25 역삼점,3200", signalId: "" },
  { text: "2026-03-02,스트리밍 구독,12900", signalId: "sub" },
  { text: "2026-03-02,배달의민족,23000", signalId: "" },
  { text: "2026-03-03,서울교통공사,1400", signalId: "" },
  { text: "2026-03-04,블루보틀 성수,6800", signalId: "cafe" },
  { text: "2026-03-06,메가박스 코엑스,180000", signalId: "outlier" },
  { text: "2026-03-08,메가커피 삼성,2000", signalId: "cafe" },
  { text: "2026-03-09,올리브영,31900", signalId: "" },
] as const;

export const LANDING_SIGNAL_ROWS: readonly LandingSignalRow[] = [
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
] as const;

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
```

`LANDING_CSV_ROWS` 의 빈 `signalId` 는 "어떤 지적에도 걸리지 않은 줄"이다. 테스트에서 `.filter(Boolean)` 로 걸러진다.

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/lib/landing-samples.test.ts src/lib/signals/thresholds.test.ts`
Expected: PASS (두 파일 모두)

- [ ] **Step 6: 커밋한다**

```bash
git add src/lib/landing-samples.ts src/lib/landing-samples.test.ts src/lib/signals/thresholds.ts
git commit -m "feat(landing): 랜딩 예시 데이터를 임계값에서 파생시켜 한 곳에 모은다"
```

---

### Task 2: 랜딩 토큰·공통 CSS·섹션 껍데기

토큰 9개를 신설하고, 섹션을 카드에서 구분선으로 바꾸고, 여섯 섹션이 공유하는 껍데기 컴포넌트를 만든다. jsdom 에 없는 `matchMedia` · `IntersectionObserver` 스텁도 여기서 넣는다 — 이후 모든 컴포넌트 테스트가 이 둘에 의존한다.

**Files:**
- Modify: `test/setup.ts`
- Modify: `src/app/globals.css` (`:root` 108줄 부근 · `[data-theme="dark"]` 138줄 부근 · `.landing-section` 3153줄 · `.landing-main` 3126줄 · `.landing-*` 구간 끝 3676줄 뒤에 추가)
- Create: `src/components/landing/LandingSection.tsx`
- Test: `src/components/landing/LandingSection.test.tsx`

**Interfaces:**
- Produces: `LandingSection({ children, hint, id, label, lead, title }: { children: ReactNode; hint?: string; id?: string; label?: string; lead?: string; title: string })` — `<section className="landing-section landing-reveal">` 을 렌더하고, 뷰포트에 처음 들어올 때 `landing-reveal--in` 을 한 번 붙인다

- [ ] **Step 1: 테스트 셋업에 브라우저 API 스텁을 넣는다**

`test/setup.ts` 를 아래로 바꾼다. jsdom 은 `matchMedia` 와 `IntersectionObserver` 를 구현하지 않아, 스텁이 없으면 이 태스크 이후의 모든 컴포넌트 테스트가 `TypeError` 로 죽는다.

```ts
import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

// jsdom 에는 둘 다 없다. 랜딩 컴포넌트가 prefers-reduced-motion 을 읽고
// 스크롤 진입을 관찰하므로 테스트 환경에서도 존재해야 한다.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

if (!window.IntersectionObserver) {
  window.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds = [] as const;
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`src/components/landing/LandingSection.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingSection } from "./LandingSection";

describe("LandingSection", () => {
  it("renders the label, title and lead above the section body", () => {
    render(
      <LandingSection
        label="무엇을 잡나"
        lead="잡는 조건이 숫자로 정해져 있습니다."
        title="이 다섯 가지를 놓치지 않습니다"
      >
        <p>본문</p>
      </LandingSection>,
    );

    expect(screen.getByText("무엇을 잡나")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "이 다섯 가지를 놓치지 않습니다",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("잡는 조건이 숫자로 정해져 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("본문")).toBeInTheDocument();
  });

  it("omits the label and lead when they are not given", () => {
    const { container } = render(
      <LandingSection title="요금제">
        <p>본문</p>
      </LandingSection>,
    );

    expect(
      container.querySelector(".landing-section__eyebrow"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".landing-section__lead"),
    ).not.toBeInTheDocument();
  });

  it("passes the id through so in-page links keep working", () => {
    const { container } = render(
      <LandingSection id="pricing" title="요금제">
        <p>본문</p>
      </LandingSection>,
    );

    expect(container.querySelector("section")).toHaveAttribute("id", "pricing");
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/components/landing/LandingSection.test.tsx`
Expected: FAIL — `Failed to resolve import "./LandingSection"`

- [ ] **Step 4: `LandingSection` 을 쓴다**

`src/components/landing/LandingSection.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

type LandingSectionProps = {
  children: ReactNode;
  hint?: string;
  id?: string;
  label?: string;
  lead?: string;
  title: string;
};

/** 뷰포트에 처음 들어올 때 한 번만 true 가 된다. 동작 줄이기가 켜져 있으면 처음부터 true. */
function useRevealed(ref: RefObject<HTMLElement | null>): boolean {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;

    if (!node || revealed) {
      return;
    }

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduced || typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [ref, revealed]);

  return revealed;
}

export function LandingSection({
  children,
  hint,
  id,
  label,
  lead,
  title,
}: LandingSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const revealed = useRevealed(ref);

  return (
    <section
      className={`landing-section landing-reveal${revealed ? " landing-reveal--in" : ""}`}
      id={id}
      ref={ref}
    >
      {label ? <span className="landing-section__eyebrow">{label}</span> : null}
      <h2 className="landing-section__title">{title}</h2>
      {lead ? <p className="landing-section__lead">{lead}</p> : null}
      {hint ? <p className="landing-section__hint">{hint}</p> : null}
      {children}
    </section>
  );
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/components/landing/LandingSection.test.tsx`
Expected: PASS (3건)

- [ ] **Step 6: 토큰 9개를 `globals.css` 에 넣는다**

`:root` 안, `--landing-max-width: 1040px;` 바로 아래(현재 108줄 부근)에 추가한다.

```css
  --landing-ease: cubic-bezier(0.2, 0, 0.2, 1);
  --landing-glow-a: rgba(37, 87, 230, 0.32);
  --landing-glow-b: rgba(217, 80, 139, 0.25);
  --landing-lift: 0 18px 40px -24px rgba(11, 11, 18, 0.42);
  --landing-lift-hover: 0 20px 38px -20px rgba(11, 11, 18, 0.34);
  --landing-lift-strong: 0 32px 60px -34px rgba(11, 11, 18, 0.4);
  --landing-mark: rgba(251, 210, 78, 0.46);
  --landing-mark-line: rgba(179, 141, 18, 0.55);
  --landing-accent-height: 3px;
```

`[data-theme="dark"]` 안, `--cat-other: #A8A8B8;` 아래에 어두운 쪽 6개를 추가한다. `--landing-ease` 와 `--landing-accent-height` 는 모드가 같으므로 다시 쓰지 않는다.

```css
  --landing-glow-a: rgba(37, 87, 230, 0.52);
  --landing-glow-b: rgba(217, 80, 139, 0.38);
  --landing-lift: 0 18px 40px -20px rgba(0, 0, 0, 0.7);
  --landing-lift-hover: 0 20px 38px -16px rgba(0, 0, 0, 0.8);
  --landing-lift-strong: 0 32px 60px -30px rgba(0, 0, 0, 0.8);
  --landing-mark: rgba(232, 184, 24, 0.22);
  --landing-mark-line: rgba(232, 184, 24, 0.55);
```

- [ ] **Step 7: 섹션을 카드에서 구분선으로 바꾼다**

`.landing-main`(3126줄)의 `gap: var(--space-xl);` 을 `gap: 0;` 으로 바꾼다. 섹션이 카드가 아니게 되면 간격은 각 섹션의 상하 패딩이 만든다.

`.landing-section`(3153줄)을 통째로 아래로 바꾼다.

```css
/* 섹션은 카드가 아니다 — 카드는 섹션 안의 타일로 한 단 내려갔다.
   전부 카드면 타일과 층이 갈리지 않는다. */
.landing-section {
  border-top: var(--line-width) solid var(--hairline-soft);
  display: flex;
  flex-direction: column;
  padding: 56px 0;
}
```

- [ ] **Step 8: 공통 CSS를 `.landing-*` 구간 끝(3676줄, `.landing-footer__note` 규칙 뒤)에 추가한다**

```css
/* ══════ 랜딩 개편 — 공통 ══════ */

.landing-section__eyebrow {
  align-items: center;
  align-self: flex-start;
  color: var(--text-tertiary);
  display: inline-flex;
  font-size: var(--font-size-label);
  font-weight: 600;
  gap: 7px;
  letter-spacing: 0.6px;
  margin-bottom: 10px;
  text-transform: uppercase;
}

.landing-section__eyebrow::before {
  background: var(--text-muted);
  border-radius: var(--radius-full);
  content: "";
  height: 7px;
  width: 7px;
}

.landing-section__hint {
  align-items: center;
  color: var(--text-tertiary);
  display: inline-flex;
  font-size: var(--font-size-body-sm);
  gap: 7px;
  margin-top: var(--space-md);
}

.landing-trustline {
  align-items: flex-start;
  background: color-mix(in srgb, var(--surface-soft) 84%, transparent);
  border: var(--line-width) solid var(--hairline-soft);
  border-radius: var(--radius-lg);
  color: var(--text-tertiary);
  display: flex;
  font-size: var(--font-size-body-xs);
  gap: var(--space-xs);
  line-height: 1.55;
  margin-top: var(--space-lg);
  padding: 11px var(--space-sm);
}

.landing-trustline b {
  color: var(--text-secondary);
  font-weight: 600;
}

/* 카드 상단 액센트 라인. --landing-accent 를 인라인으로 받는다. */
.landing-acc {
  position: relative;
}

.landing-acc::before {
  background: var(--landing-accent, var(--hairline-strong));
  content: "";
  height: var(--landing-accent-height);
  inset-inline: 0;
  position: absolute;
  top: 0;
  z-index: 2;
}

.landing-lift {
  transition:
    transform 180ms var(--landing-ease),
    box-shadow 180ms var(--landing-ease),
    border-color 180ms var(--landing-ease);
}

.landing-lift:hover {
  box-shadow: var(--landing-lift-hover);
  transform: translateY(-1px);
}

.landing-sigdot {
  border-radius: var(--radius-full);
  display: inline-block;
  flex: none;
  height: 8px;
  width: 8px;
}

.landing-reveal {
  opacity: 0;
  transform: translateY(14px);
  transition:
    opacity 460ms var(--landing-ease),
    transform 460ms var(--landing-ease);
}

.landing-reveal--in {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .landing-reveal {
    opacity: 1;
    transform: none;
  }

  .landing-lift,
  .landing-reveal {
    transition: none;
  }
}
```

- [ ] **Step 9: 전체 테스트와 빌드를 돌린다**

Run: `npm run test`
Expected: PASS — 단 `src/app/(marketing)/page.test.tsx` 는 아직 손대지 않았으므로 기존 그대로 통과해야 한다. 여기서 깨지면 `.landing-section` 변경이 마크업 가정을 건드린 것이므로 원인을 확인한다.

Run: `npm run lint && npm run build`
Expected: 둘 다 성공

- [ ] **Step 10: 커밋한다**

```bash
git add test/setup.ts src/app/globals.css src/components/landing/LandingSection.tsx src/components/landing/LandingSection.test.tsx
git commit -m "feat(landing): 랜딩 전용 토큰을 신설하고 섹션 껍데기를 분리한다"
```

---

### Task 3: 숫자 하이라이트 (`Highlight`)

인사이트 문장 안의 금액·비율에 형광 배경을 깔고, hover·focus 시 근거 툴팁을 띄운다.

**Files:**
- Create: `src/components/landing/Highlight.tsx`
- Modify: `src/app/globals.css` (Task 2가 추가한 공통 구간 뒤)
- Test: `src/components/landing/Highlight.test.tsx`

**Interfaces:**
- Produces: `Highlight({ children, evidence }: { children: ReactNode; evidence: string })` — `<span className="landing-hl" tabIndex={0}>` 안에 본문과 `<span className="landing-hl__tip">` 을 렌더한다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/landing/Highlight.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Highlight } from "./Highlight";

describe("Highlight", () => {
  it("keeps the highlighted number reachable by keyboard", () => {
    render(<Highlight evidence="거래 12건을 더한 값">62,000원(+58%)</Highlight>);

    expect(screen.getByText("62,000원(+58%)")).toHaveAttribute("tabindex", "0");
  });

  it("carries the evidence text with the number instead of hiding it", () => {
    render(<Highlight evidence="거래 12건을 더한 값">62,000원(+58%)</Highlight>);

    expect(screen.getByText("거래 12건을 더한 값")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/components/landing/Highlight.test.tsx`
Expected: FAIL — `Failed to resolve import "./Highlight"`

- [ ] **Step 3: `Highlight` 를 쓴다**

`src/components/landing/Highlight.tsx`:

```tsx
import type { ReactNode } from "react";

type HighlightProps = {
  children: ReactNode;
  evidence: string;
};

/** 문장 안의 금액·비율. 숫자가 어디서 나왔는지를 툴팁으로 붙여 둔다 —
    이 제품에서 숫자는 전부 집계 결과이고, 그걸 보여줄 수 있어야 한다. */
export function Highlight({ children, evidence }: HighlightProps) {
  return (
    <span className="landing-hl" tabIndex={0}>
      {children}
      <span className="landing-hl__tip" role="tooltip">
        {evidence}
      </span>
    </span>
  );
}
```

- [ ] **Step 4: CSS를 추가한다**

`globals.css` 의 랜딩 공통 구간 뒤에 붙인다.

```css
/* ══════ 랜딩 — 숫자 하이라이트 ══════ */

.landing-hl {
  background: var(--landing-mark);
  border-radius: 3px;
  box-shadow: inset 0 -1px 0 var(--landing-mark-line);
  color: inherit;
  cursor: help;
  display: inline;
  font-weight: 600;
  padding: 0 2px;
  position: relative;
}

.landing-hl__tip {
  background: var(--ink);
  border-radius: var(--radius-lg);
  bottom: calc(100% + 9px);
  color: var(--surface-page);
  font-size: var(--font-size-body-xs);
  font-weight: 400;
  left: 50%;
  line-height: 1.5;
  max-width: 250px;
  opacity: 0;
  padding: 9px 11px;
  pointer-events: none;
  position: absolute;
  transform: translate(-50%, 4px);
  transition:
    opacity 160ms var(--landing-ease),
    transform 160ms var(--landing-ease);
  width: max-content;
  z-index: 30;
}

.landing-hl__tip::after {
  border: 5px solid transparent;
  border-top-color: var(--ink);
  content: "";
  left: 50%;
  margin-left: -5px;
  position: absolute;
  top: 100%;
}

.landing-hl:hover .landing-hl__tip,
.landing-hl:focus-visible .landing-hl__tip {
  opacity: 1;
  transform: translate(-50%, 0);
}

@media (prefers-reduced-motion: reduce) {
  .landing-hl__tip {
    transition: none;
  }
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/components/landing/Highlight.test.tsx`
Expected: PASS (2건)

- [ ] **Step 6: 커밋한다**

```bash
git add src/components/landing/Highlight.tsx src/components/landing/Highlight.test.tsx src/app/globals.css
git commit -m "feat(landing): 문장 속 금액에 근거 툴팁을 붙인다"
```

---

### Task 4: 히어로 인사이트 카드 스택 (`InsightCardStack`)

①의 핵심이다. 카드 3장이 겹쳐 쌓이고 4.6초마다 순회하며, `규칙이 고른 것 ↔ AI가 옮긴 문장` 토글과 근거 뒤집기를 갖는다. **사용자가 손대는 순간 자동 순환은 영구히 멈춘다.**

**Files:**
- Create: `src/components/landing/InsightCardStack.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/landing/InsightCardStack.test.tsx`

**Interfaces:**
- Consumes: `LANDING_INSIGHT_CARDS`, `categoryVar`, `type SentencePart` (`@/lib/landing-samples`), `SIGNAL_TYPE_LABELS` (`@/lib/signals/thresholds`), `Highlight` (`./Highlight`), `Badge` (`@/components/Badge`)
- Produces: `InsightCardStack()` — props 없음

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/landing/InsightCardStack.test.tsx`:

```tsx
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InsightCardStack } from "./InsightCardStack";

describe("InsightCardStack", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders three example insight cards with type, impact and sentence", () => {
    render(<InsightCardStack />);

    const cards = screen.getAllByRole("article");

    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText("카테고리 급증")).toBeInTheDocument();
    expect(within(cards[0]).getByText("+62,000원")).toBeInTheDocument();
    // 문장은 <span> 조각으로 쪼개져 있고 부모 <p> 의 textContent 도 같은 정규식에
    // 걸린다. 요소가 둘이므로 getByText 는 쓸 수 없다.
    expect(
      within(cards[0]).getAllByText(/카페·간식이 지난달보다/).length,
    ).toBeGreaterThan(0);
  });

  it("marks the stack as example data", () => {
    render(<InsightCardStack />);

    expect(screen.getByText("예시")).toBeInTheDocument();
  });

  it("starts on the AI sentence view and hides the raw signal view", () => {
    render(<InsightCardStack />);

    expect(
      screen.getByRole("button", { name: "AI가 옮긴 문장" }),
    ).toHaveAttribute("aria-pressed", "true");
    // 원자료는 DOM 에 있되 hidden 이다 — 토글이 두 뷰를 오가므로 언마운트하지 않는다.
    expect(screen.getByText("category_spike")).not.toBeVisible();
  });

  it("swaps the sentence for the raw signal fields when the toggle is pressed", () => {
    render(<InsightCardStack />);

    fireEvent.click(screen.getByRole("button", { name: "규칙이 고른 것" }));

    expect(screen.getByText("category_spike")).toBeVisible();
    expect(
      screen.getByText("src/lib/signals/detect-category-spike.ts"),
    ).toBeVisible();
    expect(screen.getAllByText(/카페·간식이 지난달보다/)[0]).not.toBeVisible();
  });

  it("shows the threshold comparison from the thresholds file in the raw view", () => {
    render(<InsightCardStack />);

    fireEvent.click(screen.getByRole("button", { name: "규칙이 고른 것" }));

    expect(screen.getByText(/≥ 50%/)).toBeVisible();
    expect(screen.getByText(/≥ 30,000/)).toBeVisible();
  });

  it("says the AI has not done anything yet while showing raw fields", () => {
    render(<InsightCardStack />);

    fireEvent.click(screen.getByRole("button", { name: "규칙이 고른 것" }));

    expect(
      screen.getByText(/AI는 아직 아무것도 하지 않았습니다/),
    ).toBeInTheDocument();
  });

  it("reveals the transactions behind the amount when the card is flipped", () => {
    render(<InsightCardStack />);

    const cards = screen.getAllByRole("article");

    fireEvent.click(
      within(cards[0]).getByRole("button", { name: "근거 보기 →" }),
    );

    expect(cards[0]).toHaveClass("landing-icard--flipped");
    expect(within(cards[0]).getByText("이 금액을 만든 거래")).toBeVisible();
    expect(within(cards[0]).getByText("블루보틀 성수")).toBeVisible();
    expect(within(cards[0]).getByText("168,000원")).toBeVisible();
  });

  it("flips the card back", () => {
    render(<InsightCardStack />);

    const cards = screen.getAllByRole("article");

    fireEvent.click(
      within(cards[0]).getByRole("button", { name: "근거 보기 →" }),
    );
    fireEvent.click(
      within(cards[0]).getByRole("button", { name: "← 돌아가기" }),
    );

    expect(cards[0]).not.toHaveClass("landing-icard--flipped");
  });

  it("rotates to the next card on its own", () => {
    render(<InsightCardStack />);

    expect(screen.getAllByRole("article")[0]).toHaveAttribute("data-pos", "0");

    act(() => {
      vi.advanceTimersByTime(4600);
    });

    expect(screen.getAllByRole("article")[0]).toHaveAttribute("data-pos", "2");
  });

  it("stops rotating for good once the reader touches it", () => {
    render(<InsightCardStack />);

    fireEvent.click(screen.getByRole("button", { name: "예시 2" }));

    expect(screen.getAllByRole("article")[1]).toHaveAttribute("data-pos", "0");

    act(() => {
      vi.advanceTimersByTime(4600 * 3);
    });

    expect(screen.getAllByRole("article")[1]).toHaveAttribute("data-pos", "0");
  });
});
```

타이머가 돌린 state 변경은 `act()` 로 감싸야 React가 리렌더를 flush 한다. import 줄에 `act` 를 포함한다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/components/landing/InsightCardStack.test.tsx`
Expected: FAIL — `Failed to resolve import "./InsightCardStack"`

- [ ] **Step 3: `InsightCardStack` 을 쓴다**

`src/components/landing/InsightCardStack.tsx`:

```tsx
"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { Badge } from "@/components/Badge";
import {
  categoryVar,
  LANDING_INSIGHT_CARDS,
  type SentencePart,
} from "@/lib/landing-samples";
import { SIGNAL_TYPE_LABELS } from "@/lib/signals/thresholds";

import { Highlight } from "./Highlight";

const ROTATE_MS = 4_600;

type Mode = "ai" | "raw";

const MODE_NOTES: Record<Mode, { lead: string; rest: string }> = {
  ai: {
    lead: "AI가 옮긴 문장입니다.",
    rest: " 왼쪽 토글을 누르면 이 문장이 나오기 전, 규칙이 고른 원자료가 그대로 보입니다.",
  },
  raw: {
    lead: "규칙이 고른 원자료입니다.",
    rest: " src/lib/signals/ 의 순수 함수가 임계값으로 판정한 결과 그대로이고, AI는 아직 아무것도 하지 않았습니다.",
  },
};

function Sentence({ parts }: { parts: readonly SentencePart[] }) {
  return (
    <p className="landing-icard__text">
      {parts.map((part, index) =>
        part.kind === "mark" ? (
          <Highlight evidence={part.evidence} key={index}>
            {part.text}
          </Highlight>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  );
}

export function InsightCardStack() {
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<Mode>("ai");
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  useEffect(() => {
    if (!autoRotate) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const timer = setInterval(() => {
      setActive((current) => (current + 1) % LANDING_INSIGHT_CARDS.length);
    }, ROTATE_MS);

    return () => {
      clearInterval(timer);
    };
  }, [autoRotate]);

  /** 읽는 중에 카드가 넘어가지 않도록, 한 번 손대면 다시 돌지 않는다. */
  function stopAuto() {
    setAutoRotate(false);
  }

  function selectCard(index: number) {
    stopAuto();
    setActive(index);
  }

  function selectMode(next: Mode) {
    stopAuto();
    setMode(next);
    setFlippedId(null);
  }

  const note = MODE_NOTES[mode];

  return (
    <div>
      <div className="landing-modebar">
        <Badge variant="neutral">예시</Badge>
        <div aria-label="표시 방식" className="landing-seg" role="group">
          <button
            aria-pressed={mode === "raw"}
            className="landing-seg__btn"
            onClick={() => selectMode("raw")}
            type="button"
          >
            규칙이 고른 것
          </button>
          <button
            aria-pressed={mode === "ai"}
            className="landing-seg__btn"
            onClick={() => selectMode("ai")}
            type="button"
          >
            AI가 옮긴 문장
          </button>
        </div>
      </div>

      <div
        className="landing-stack"
        onFocus={stopAuto}
        onMouseEnter={stopAuto}
      >
        {LANDING_INSIGHT_CARDS.map((card, index) => {
          const position =
            (index - active + LANDING_INSIGHT_CARDS.length) %
            LANDING_INSIGHT_CARDS.length;
          const flipped = flippedId === card.id;
          const accent = {
            "--landing-accent": categoryVar(card.category),
          } as CSSProperties;

          return (
            <article
              className={`landing-icard${flipped ? " landing-icard--flipped" : ""}`}
              data-pos={position}
              key={card.id}
            >
              <div className="landing-icard__inner">
                <div
                  className="landing-icard__face landing-icard__face--front landing-acc"
                  style={accent}
                >
                  <div className="landing-icard__head">
                    <span className="landing-icard__type">
                      <span
                        className="landing-sigdot"
                        style={{ background: categoryVar(card.category) }}
                      />
                      {SIGNAL_TYPE_LABELS[card.type]}
                    </span>
                    <span className="landing-icard__impact tabular-nums">
                      {card.impact}
                    </span>
                  </div>
                  <p className="landing-icard__subject">{card.subject}</p>

                  <div hidden={mode !== "ai"}>
                    <Sentence parts={card.sentence} />
                  </div>

                  <div hidden={mode !== "raw"}>
                    <div className="landing-raw">
                      {card.raw.map((row) => (
                        <div className="landing-raw__row" key={row.key}>
                          <span className="landing-raw__k">{row.key}</span>
                          <span
                            className={`landing-raw__v${row.pass ? " landing-raw__v--pass" : ""}`}
                          >
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="landing-raw__src">{card.source}</p>
                  </div>

                  <div className="landing-icard__foot">
                    <button
                      className="landing-icard__link"
                      onClick={() => {
                        stopAuto();
                        setFlippedId(card.id);
                      }}
                      type="button"
                    >
                      근거 보기 →
                    </button>
                  </div>
                </div>

                <div
                  className="landing-icard__face landing-icard__face--back landing-acc"
                  style={accent}
                >
                  <div className="landing-ev__title">
                    <span>{card.evidence.title}</span>
                    <button
                      className="landing-ev__back"
                      onClick={() => setFlippedId(null)}
                      type="button"
                    >
                      ← 돌아가기
                    </button>
                  </div>
                  <div className="landing-ev__list">
                    {card.evidence.rows.map((row) => (
                      <div
                        className="landing-ev__row"
                        key={`${row.date}-${row.merchant}`}
                      >
                        <span>{row.date}</span>
                        <span>{row.merchant}</span>
                        <span>{row.amount}</span>
                      </div>
                    ))}
                  </div>
                  <div className="landing-ev__sum">
                    <span>{card.evidence.summaryLabel}</span>
                    <b>{card.evidence.summaryValue}</b>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="landing-dots">
        {LANDING_INSIGHT_CARDS.map((card, index) => (
          <button
            aria-current={index === active}
            aria-label={`예시 ${index + 1}`}
            className="landing-dot"
            key={card.id}
            onClick={() => selectCard(index)}
            type="button"
          />
        ))}
      </div>

      <p className="landing-modenote">
        <b>{note.lead}</b>
        {note.rest}
      </p>
    </div>
  );
}
```

**주의 — 뒤집힌 카드는 `hidden` 이 아니라 3D 뒷면이다.** 두 면 모두 DOM 에 있고 `backface-visibility: hidden` 으로 감춘다. 테스트가 `toBeVisible()` 로 뒷면을 확인할 수 있는 이유다(jsdom은 transform을 계산하지 않는다).

- [ ] **Step 4: CSS를 추가한다**

`globals.css` 의 하이라이트 구간 뒤에 붙인다.

```css
/* ══════ 랜딩 ① 히어로 인사이트 스택 ══════ */

.landing-modebar {
  align-items: center;
  display: flex;
  gap: var(--space-sm);
  justify-content: space-between;
  margin-bottom: 10px;
}

.landing-seg {
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  border-radius: var(--radius-full);
  display: inline-flex;
  gap: 2px;
  padding: 3px;
}

.landing-seg__btn {
  background: transparent;
  border: 0;
  border-radius: var(--radius-full);
  color: var(--text-tertiary);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-body-xs);
  font-weight: 600;
  height: 28px;
  padding: 0 13px;
  transition:
    background 150ms var(--landing-ease),
    color 150ms var(--landing-ease);
}

.landing-seg__btn[aria-pressed="true"] {
  background: var(--canvas);
  box-shadow: 0 1px 3px rgba(11, 11, 18, 0.14);
  color: var(--ink);
}

.landing-modenote {
  color: var(--text-tertiary);
  font-size: var(--font-size-body-xs);
  line-height: 1.55;
  margin-top: 10px;
  min-height: 34px;
}

.landing-modenote b {
  color: var(--text-secondary);
  font-weight: 600;
}

.landing-stack {
  height: 272px;
  perspective: 1400px;
  position: relative;
}

.landing-icard {
  height: 248px;
  inset-inline: 0;
  position: absolute;
  top: 0;
  transition:
    transform 520ms var(--landing-ease),
    opacity 520ms var(--landing-ease);
}

.landing-icard[data-pos="0"] {
  opacity: 1;
  transform: translateY(0) scale(1);
  z-index: 3;
}

.landing-icard[data-pos="1"] {
  opacity: 0.66;
  transform: translateY(16px) scale(0.955);
  z-index: 2;
}

.landing-icard[data-pos="2"] {
  opacity: 0.34;
  transform: translateY(32px) scale(0.91);
  z-index: 1;
}

.landing-icard[data-pos="1"] .landing-icard__face,
.landing-icard[data-pos="2"] .landing-icard__face {
  pointer-events: none;
}

.landing-icard__inner {
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 560ms var(--landing-ease);
  width: 100%;
}

.landing-icard--flipped .landing-icard__inner {
  transform: rotateY(180deg);
}

.landing-icard__face {
  backface-visibility: hidden;
  background: var(--canvas);
  border: var(--line-width) solid var(--hairline);
  border-radius: var(--radius-xl);
  box-shadow: var(--landing-lift);
  display: flex;
  flex-direction: column;
  inset: 0;
  overflow: hidden;
  padding: calc(var(--space-lg) + 3px) var(--space-lg) var(--space-lg);
  position: absolute;
}

.landing-icard__face--back {
  background: var(--surface-soft);
  transform: rotateY(180deg);
}

.landing-icard[data-pos="0"] .landing-icard__face--front:hover {
  box-shadow: var(--landing-lift), 0 0 0 1px var(--hairline-strong);
}

.landing-icard__head {
  align-items: baseline;
  display: flex;
  gap: var(--space-sm);
  justify-content: space-between;
}

.landing-icard__type {
  align-items: center;
  color: var(--text-secondary);
  display: inline-flex;
  font-size: var(--font-size-body-sm);
  font-weight: 600;
  gap: 6px;
}

.landing-icard__impact {
  color: var(--brand-red-dark);
  font-size: var(--font-size-insight-impact);
  font-weight: 600;
  letter-spacing: -0.6px;
}

.landing-icard__subject {
  color: var(--text-tertiary);
  font-size: var(--font-size-body-sm);
  margin-top: 10px;
}

.landing-icard__text {
  color: var(--ink);
  font-size: var(--font-size-copy);
  line-height: 1.7;
  margin-top: 8px;
}

.landing-icard__foot {
  margin-top: auto;
  padding-top: var(--space-sm);
}

.landing-icard__link {
  background: transparent;
  border: 0;
  color: var(--text-link);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-body-sm);
  font-weight: 500;
  padding: 0;
}

.landing-icard__link:hover {
  text-decoration: underline;
}

.landing-raw {
  font-family: var(--font-mono);
  font-size: var(--font-size-body-xs);
  margin-top: var(--space-sm);
}

.landing-raw__row {
  display: grid;
  gap: var(--space-xs);
  grid-template-columns: 106px minmax(0, 1fr);
  padding: 3px 0;
}

.landing-raw__k {
  color: var(--text-muted);
}

.landing-raw__v {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.landing-raw__v--pass {
  color: var(--success-accent);
  font-weight: 600;
}

.landing-raw__src {
  color: var(--text-muted);
  font-family: var(--font-core);
  font-size: var(--font-size-label);
  margin-top: 10px;
}

.landing-ev__title {
  align-items: center;
  color: var(--ink);
  display: flex;
  font-size: var(--font-size-body-sm);
  font-weight: 600;
  justify-content: space-between;
}

.landing-ev__back {
  background: transparent;
  border: 0;
  color: var(--text-link);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-body-sm);
  padding: 0;
}

.landing-ev__list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: var(--space-sm);
}

.landing-ev__row {
  align-items: center;
  display: grid;
  font-size: var(--font-size-body-xs);
  gap: var(--space-xs);
  grid-template-columns: 38px minmax(0, 1fr) auto;
}

.landing-ev__row span:first-child {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.landing-ev__row span:nth-child(2) {
  color: var(--text-body);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.landing-ev__row span:last-child {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.landing-ev__sum {
  border-top: var(--line-width) solid var(--hairline);
  color: var(--text-secondary);
  display: flex;
  font-size: var(--font-size-body-xs);
  justify-content: space-between;
  margin-top: auto;
  padding-top: 10px;
}

.landing-ev__sum b {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.landing-dots {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-top: var(--space-sm);
}

.landing-dot {
  background: var(--hairline-strong);
  border: 0;
  border-radius: var(--radius-full);
  cursor: pointer;
  height: 6px;
  padding: 0;
  transition:
    width 200ms var(--landing-ease),
    background 200ms var(--landing-ease);
  width: 6px;
}

.landing-dot[aria-current="true"] {
  background: var(--ink);
  width: 18px;
}

@media (prefers-reduced-motion: reduce) {
  .landing-icard,
  .landing-icard__inner,
  .landing-dot,
  .landing-seg__btn {
    transition: none;
  }
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/components/landing/InsightCardStack.test.tsx`
Expected: PASS (10건)

- [ ] **Step 6: 커밋한다**

```bash
git add src/components/landing/InsightCardStack.tsx src/components/landing/InsightCardStack.test.tsx src/app/globals.css
git commit -m "feat(landing): 히어로에 원자료와 AI 문장을 오가는 인사이트 스택을 넣는다"
```

---

### Task 5: CSV ↔ 지적 연결 (`CsvToSignals`)

②. CSV 줄이나 지적 행에 hover·focus·click 하면 대응하는 것만 밝아지고 나머지는 흐려진다. 양방향이고, 컨테이너의 `data-focus` 속성 하나로 CSS가 처리한다.

**Files:**
- Create: `src/components/landing/CsvToSignals.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/landing/CsvToSignals.test.tsx`

**Interfaces:**
- Consumes: `LANDING_CSV_ROWS`, `LANDING_SIGNAL_ROWS`, `categoryVar` (`@/lib/landing-samples`)
- Produces: `CsvToSignals()` — props 없음

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/landing/CsvToSignals.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CsvToSignals } from "./CsvToSignals";

describe("CsvToSignals", () => {
  it("shows the raw csv lines next to the signals they became", () => {
    render(<CsvToSignals />);

    expect(
      screen.getByRole("button", { name: "2026-03-02,스트리밍 구독,12900" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /구독료가 3,000원 올랐습니다/ }),
    ).toBeInTheDocument();
  });

  it("says the rest are ordered by won impact", () => {
    render(<CsvToSignals />);

    expect(screen.getByText(/원화 영향도가 큰 순서로/)).toBeInTheDocument();
  });

  it("links a csv line to its signal when the line takes focus", () => {
    const { container } = render(<CsvToSignals />);

    fireEvent.focus(
      screen.getByRole("button", { name: "2026-03-02,스트리밍 구독,12900" }),
    );

    expect(container.querySelector(".landing-transform")).toHaveAttribute(
      "data-focus",
      "sub",
    );
  });

  it("links a signal back to its csv lines when the signal takes focus", () => {
    const { container } = render(<CsvToSignals />);

    fireEvent.focus(
      screen.getByRole("button", { name: /카페·간식이 58% 늘었습니다/ }),
    );

    expect(container.querySelector(".landing-transform")).toHaveAttribute(
      "data-focus",
      "cafe",
    );
  });

  it("switches the link when another pair is picked", () => {
    const { container } = render(<CsvToSignals />);
    const transform = container.querySelector(".landing-transform");

    fireEvent.click(
      screen.getByRole("button", { name: "2026-03-06,메가박스 코엑스,180000" }),
    );
    expect(transform).toHaveAttribute("data-focus", "outlier");

    fireEvent.click(
      screen.getByRole("button", { name: "2026-03-04,블루보틀 성수,6800" }),
    );
    expect(transform).toHaveAttribute("data-focus", "cafe");
  });

  it("does not link the lines that no signal caught", () => {
    const { container } = render(<CsvToSignals />);

    fireEvent.click(
      screen.getByRole("button", { name: "2026-03-09,올리브영,31900" }),
    );

    expect(container.querySelector(".landing-transform")).not.toHaveAttribute(
      "data-focus",
    );
  });
});
```

**`mouseEnter` / `mouseLeave` 를 테스트하지 않는 이유:** `fireEvent.mouseEnter` 는 버블링되지 않는 native `mouseenter` 를 보내는데, React는 루트에서 `mouseover`/`mouseout` 을 듣고 enter/leave 를 합성하므로 핸들러가 호출되지 않는다. 같은 상태 전이를 `focus` 와 `click` 으로 덮고, 마우스로 짚었다 뗐을 때의 동작은 Task 10 육안 확인 항목에 있다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/components/landing/CsvToSignals.test.tsx`
Expected: FAIL — `Failed to resolve import "./CsvToSignals"`

- [ ] **Step 3: `CsvToSignals` 를 쓴다**

`src/components/landing/CsvToSignals.tsx`:

```tsx
"use client";

import { useState, type CSSProperties } from "react";

import {
  categoryVar,
  LANDING_CSV_ROWS,
  LANDING_SIGNAL_ROWS,
} from "@/lib/landing-samples";

export function CsvToSignals() {
  const [focused, setFocused] = useState("");

  function link(signalId: string) {
    setFocused(signalId);
  }

  return (
    <div
      className="landing-transform"
      data-focus={focused || undefined}
      onMouseLeave={() => setFocused("")}
    >
      <div className="landing-csvbox">
        <span className="landing-csvbox__label">올린 것</span>
        {LANDING_CSV_ROWS.map((row) => (
          <button
            className="landing-csvrow"
            data-sig={row.signalId}
            key={row.text}
            onClick={() => link(row.signalId)}
            onFocus={() => link(row.signalId)}
            onMouseEnter={() => link(row.signalId)}
            type="button"
          >
            {row.text}
          </button>
        ))}
      </div>

      <div aria-hidden="true" className="landing-arrow">
        <svg fill="none" height="24" viewBox="0 0 44 24" width="44">
          <path
            d="M2 12h38m0 0-8-7m8 7-8 7"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      <div className="landing-outbox">
        {LANDING_SIGNAL_ROWS.map((row) => (
          <button
            className="landing-outrow landing-acc"
            data-sig={row.signalId}
            key={row.signalId}
            onClick={() => link(row.signalId)}
            onFocus={() => link(row.signalId)}
            onMouseEnter={() => link(row.signalId)}
            style={
              { "--landing-accent": categoryVar(row.category) } as CSSProperties
            }
            type="button"
          >
            <span
              className="landing-sigdot"
              style={{ background: categoryVar(row.category) }}
            />
            <span className="landing-outrow__name">{row.name}</span>
            <span className="landing-outrow__amt tabular-nums">
              {row.amount}
            </span>
          </button>
        ))}
        <p className="landing-outmore">외 2건 · 원화 영향도가 큰 순서로</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: CSS를 추가한다**

```css
/* ══════ 랜딩 ② CSV ↔ 지적 ══════ */

.landing-transform {
  align-items: center;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px minmax(0, 1fr);
  margin-top: var(--space-lg);
}

.landing-csvbox {
  background: var(--canvas);
  border: var(--line-width) solid var(--hairline);
  border-radius: var(--radius-xl);
  box-shadow: var(--landing-lift);
  font-family: var(--font-mono);
  font-size: var(--font-size-body-xs);
  height: 258px;
  overflow: hidden;
  padding: var(--space-sm);
  position: relative;
}

.landing-csvbox::after {
  background: linear-gradient(to bottom, transparent, var(--canvas));
  bottom: 0;
  content: "";
  height: 56px;
  inset-inline: 0;
  pointer-events: none;
  position: absolute;
}

.landing-csvbox__label {
  color: var(--text-muted);
  font-family: var(--font-core);
  font-size: var(--font-size-label);
  font-weight: 600;
  letter-spacing: 0.5px;
  position: absolute;
  right: 12px;
  top: 9px;
  z-index: 3;
}

.landing-csvrow {
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  display: block;
  font: inherit;
  line-height: 1.7;
  padding: 3px 7px;
  text-align: left;
  transition:
    background 150ms var(--landing-ease),
    color 150ms var(--landing-ease),
    opacity 150ms var(--landing-ease);
  width: 100%;
}

.landing-arrow {
  color: var(--text-muted);
  display: grid;
  place-items: center;
}

.landing-outbox {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.landing-outrow {
  align-items: center;
  background: var(--canvas);
  border: var(--line-width) solid var(--hairline);
  border-radius: var(--radius-lg);
  cursor: pointer;
  display: flex;
  font-family: inherit;
  gap: var(--space-sm);
  overflow: hidden;
  padding: calc(12px + var(--landing-accent-height)) var(--space-md) 12px;
  text-align: left;
  transition:
    border-color 150ms var(--landing-ease),
    opacity 150ms var(--landing-ease),
    transform 150ms var(--landing-ease),
    box-shadow 150ms var(--landing-ease);
  width: 100%;
}

.landing-outrow:hover {
  box-shadow: var(--landing-lift-hover);
  transform: translateY(-1px);
}

.landing-outrow__name {
  color: var(--ink);
  flex: 1;
  font-size: var(--font-size-body);
  font-weight: 500;
}

.landing-outrow__amt {
  color: var(--brand-red-dark);
  font-size: var(--font-size-body);
  font-weight: 600;
}

.landing-outmore {
  color: var(--text-tertiary);
  font-size: var(--font-size-body-sm);
  padding: 2px var(--space-md) 0;
}

/* 하나를 짚으면 나머지가 물러난다 — 어느 줄이 어느 문장이 됐는지가 남는다. */
.landing-transform[data-focus] .landing-csvrow {
  opacity: 0.3;
}

.landing-transform[data-focus] .landing-outrow {
  opacity: 0.36;
}

.landing-transform[data-focus="cafe"] .landing-csvrow[data-sig="cafe"],
.landing-transform[data-focus="sub"] .landing-csvrow[data-sig="sub"],
.landing-transform[data-focus="outlier"] .landing-csvrow[data-sig="outlier"] {
  background: var(--landing-mark);
  color: var(--ink);
  font-weight: 600;
  opacity: 1;
}

.landing-transform[data-focus="cafe"] .landing-outrow[data-sig="cafe"],
.landing-transform[data-focus="sub"] .landing-outrow[data-sig="sub"],
.landing-transform[data-focus="outlier"] .landing-outrow[data-sig="outlier"] {
  border-color: var(--ink);
  box-shadow: var(--landing-lift-hover);
  opacity: 1;
  transform: translateX(3px);
}

@media (prefers-reduced-motion: reduce) {
  .landing-csvrow,
  .landing-outrow {
    transition: none;
  }
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/components/landing/CsvToSignals.test.tsx`
Expected: PASS (6건)

- [ ] **Step 6: 커밋한다**

```bash
git add src/components/landing/CsvToSignals.tsx src/components/landing/CsvToSignals.test.tsx src/app/globals.css
git commit -m "feat(landing): 올린 CSV 줄과 받게 될 지적을 양방향으로 잇는다"
```

---

### Task 6: 지적 5종 그리드 (`SignalTypeGrid`)

③. `SIGNAL_TYPES` 5종을 전부 편다. 구독료 인상이 전폭 리드 타일(영향도 금액 포함), 나머지 넷이 3열 그리드, 여섯 번째 칸에 점선 타일.

**Files:**
- Create: `src/components/landing/SignalTypeGrid.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/landing/SignalTypeGrid.test.tsx`

**Interfaces:**
- Consumes: `LANDING_SIGNAL_TILES` (`@/lib/landing-samples`), `SIGNAL_TYPES`, `SIGNAL_TYPE_LABELS` (`@/lib/signals/thresholds`)
- Produces: `SignalTypeGrid()` — props 없음

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/landing/SignalTypeGrid.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SIGNAL_TYPE_LABELS, SIGNAL_TYPES } from "@/lib/signals/thresholds";

import { SignalTypeGrid } from "./SignalTypeGrid";

describe("SignalTypeGrid", () => {
  it("renders every signal type the detector can produce", () => {
    render(<SignalTypeGrid />);

    const grid = screen.getByRole("list", { name: "잡는 지적 5종" });

    SIGNAL_TYPES.forEach((type) => {
      expect(
        within(grid).getByText(SIGNAL_TYPE_LABELS[type]),
      ).toBeInTheDocument();
    });
  });

  it("shows the numeric condition of each type instead of a vague promise", () => {
    render(<SignalTypeGrid />);

    expect(screen.getByText(/전월 대비 50% 이상/)).toBeInTheDocument();
    expect(screen.getByText(/25~35일 간격으로 3회 이상/)).toBeInTheDocument();
  });

  it("leads with the subscription price increase and its yearly impact", () => {
    render(<SignalTypeGrid />);

    const grid = screen.getByRole("list", { name: "잡는 지적 5종" });
    const items = within(grid).getAllByRole("listitem");

    expect(within(items[0]).getByText("구독료 인상")).toBeInTheDocument();
    expect(within(items[0]).getByText("연 36,000원")).toBeInTheDocument();
  });

  it("promises to say nothing when nothing was caught", () => {
    render(<SignalTypeGrid />);

    expect(
      screen.getByText(/없는 지적을 지어내지 않습니다/),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/components/landing/SignalTypeGrid.test.tsx`
Expected: FAIL — `Failed to resolve import "./SignalTypeGrid"`

- [ ] **Step 3: `SignalTypeGrid` 를 쓴다**

`src/components/landing/SignalTypeGrid.tsx`:

```tsx
import type { CSSProperties, ReactNode } from "react";

import { LANDING_SIGNAL_TILES } from "@/lib/landing-samples";
import { SIGNAL_TYPE_LABELS, type SignalType } from "@/lib/signals/thresholds";

const TILE_ACCENTS: Record<SignalType, string> = {
  category_spike: "var(--cat-cafe-snack)",
  new_merchant_large: "var(--cat-shopping)",
  outlier_transaction: "var(--cat-culture-leisure)",
  recurring_payment: "var(--cat-grocery)",
  recurring_price_up: "var(--cat-housing-telecom)",
};

const TILE_ICONS: Record<SignalType, ReactNode> = {
  category_spike: (
    <path
      d="M2 12l3.5-4 3 2.5L14 4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
    />
  ),
  new_merchant_large: (
    <path
      d="M8 3.5v9M3.5 8h9"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.6"
    />
  ),
  outlier_transaction: (
    <>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5.5v3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      <circle cx="8" cy="10.8" fill="currentColor" r="0.8" />
    </>
  ),
  recurring_payment: (
    <>
      <path
        d="M13 7A5 5 0 1 0 12 11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <path
        d="M13 3.5V7h-3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </>
  ),
  recurring_price_up: (
    <path
      d="M8 13V3m0 0L4 7m4-4 4 4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
    />
  ),
};

function TileIcon({ type }: { type: SignalType }) {
  const accent = TILE_ACCENTS[type];

  return (
    <span
      aria-hidden="true"
      className="landing-sig__icon"
      style={{
        background: `color-mix(in srgb, ${accent} 16%, transparent)`,
        color: accent,
      }}
    >
      <svg fill="none" height="16" viewBox="0 0 16 16" width="16">
        {TILE_ICONS[type]}
      </svg>
    </span>
  );
}

export function SignalTypeGrid() {
  const [lead, ...rest] = LANDING_SIGNAL_TILES;

  return (
    <ul aria-label="잡는 지적 5종" className="landing-sig-grid">
      <li
        className="landing-sig landing-sig--lead landing-acc landing-lift"
        style={
          { "--landing-accent": TILE_ACCENTS[lead.type] } as CSSProperties
        }
      >
        <TileIcon type={lead.type} />
        <span>
          <p className="landing-sig__name">{SIGNAL_TYPE_LABELS[lead.type]}</p>
          <p className="landing-sig__cond">{lead.condition}</p>
        </span>
        <span className="landing-sig__amt tabular-nums">연 36,000원</span>
      </li>

      {rest.map((tile) => (
        <li
          className="landing-sig landing-acc landing-lift"
          key={tile.type}
          style={
            { "--landing-accent": TILE_ACCENTS[tile.type] } as CSSProperties
          }
        >
          <TileIcon type={tile.type} />
          <p className="landing-sig__name">{SIGNAL_TYPE_LABELS[tile.type]}</p>
          <p className="landing-sig__cond">{tile.condition}</p>
        </li>
      ))}

      <li className="landing-sig landing-sig--muted">
        <span>
          <p className="landing-sig__name">매달 영향도 순으로</p>
          <p className="landing-sig__cond">
            걸린 것이 없으면 없다고 적습니다. 없는 지적을 지어내지 않습니다.
          </p>
        </span>
      </li>
    </ul>
  );
}
```

리드 타일의 `연 36,000원` 은 `LANDING_INSIGHT_CARDS` 의 구독료 카드와 같은 예시 금액이다. 임계값이 아니라 예시 숫자이므로 상수 파생 대상이 아니다.

- [ ] **Step 4: CSS를 추가한다**

```css
/* ══════ 랜딩 ③ 지적 5종 ══════ */

.landing-sig-grid {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(3, minmax(0, 1fr));
  list-style: none;
  margin: var(--space-lg) 0 0;
  padding: 0;
}

.landing-sig {
  background: var(--canvas);
  border: var(--line-width) solid var(--hairline);
  border-radius: var(--radius-lg);
  overflow: hidden;
  padding: calc(var(--space-lg) + var(--landing-accent-height)) var(--space-md)
    var(--space-md);
  position: relative;
}

.landing-sig--lead {
  align-items: center;
  display: grid;
  gap: var(--space-md);
  grid-column: span 3;
  grid-template-columns: auto minmax(0, 1fr) auto;
  padding: calc(var(--space-md) + var(--landing-accent-height)) var(--space-md)
    var(--space-md);
}

.landing-sig--muted {
  background: transparent;
  border-style: dashed;
  display: grid;
  place-items: center;
  text-align: center;
}

.landing-sig__icon {
  border-radius: 9px;
  display: grid;
  flex: none;
  height: 28px;
  place-items: center;
  width: 28px;
}

.landing-sig__name {
  color: var(--ink);
  font-size: var(--font-size-body);
  font-weight: 600;
  margin-top: 12px;
}

.landing-sig--lead .landing-sig__name,
.landing-sig--muted .landing-sig__name {
  margin-top: 0;
}

.landing-sig__cond {
  color: var(--text-tertiary);
  font-size: var(--font-size-body-xs);
  line-height: 1.55;
  margin-top: 5px;
}

.landing-sig__amt {
  color: var(--brand-red-dark);
  font-size: var(--font-size-landing-amount);
  font-weight: 600;
  letter-spacing: -0.4px;
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/components/landing/SignalTypeGrid.test.tsx`
Expected: PASS (4건)

- [ ] **Step 6: 커밋한다**

```bash
git add src/components/landing/SignalTypeGrid.tsx src/components/landing/SignalTypeGrid.test.tsx src/app/globals.css
git commit -m "feat(landing): 잡는 지적 5종을 조건 숫자와 함께 편다"
```

---

### Task 7: 3단계 3번째 미리보기를 근거 패널로 교체

④의 3번째 미리보기가 지금 인사이트 카드인데, ①이 그걸 히어로로 올렸으므로 겹친다. "지적받은 문장을 열어 근거를 확인한다"는 자기 문구에 맞게 **거래 행 + 합계**로 바꾼다.

**Files:**
- Modify: `src/components/LandingStepPreview.tsx` (`ReviewStepPreview` 만)
- Modify: `src/app/globals.css` (합계 행 규칙 1개 추가)
- Test: `src/components/LandingStepPreview.test.tsx` (신설 — 지금 이 컴포넌트에는 테스트 파일이 없다)

**Interfaces:**
- Consumes: `LANDING_INSIGHT_CARDS` (`@/lib/landing-samples`)
- Produces: `ReviewStepPreview()` — 시그니처 변경 없음. 미리보기 프레임의 `aria-label` 은 `"예시 화면 — 리뷰 읽기"` 그대로 유지한다(`page.test.tsx` 가 이 이름으로 찾는다)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/LandingStepPreview.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewStepPreview } from "./LandingStepPreview";

describe("ReviewStepPreview", () => {
  it("previews the evidence panel behind a sentence, not the sentence itself", () => {
    render(<ReviewStepPreview />);

    const frame = screen.getByRole("img", { name: "예시 화면 — 리뷰 읽기" });

    expect(within(frame).getByText("근거 패널")).toBeInTheDocument();
    expect(within(frame).getByText("블루보틀 성수")).toBeInTheDocument();
    expect(within(frame).getByText("6,800원")).toBeInTheDocument();
  });

  it("closes the panel with the total that the transactions add up to", () => {
    render(<ReviewStepPreview />);

    const frame = screen.getByRole("img", { name: "예시 화면 — 리뷰 읽기" });

    expect(within(frame).getByText("외 9건")).toBeInTheDocument();
    expect(within(frame).getByText("168,000원")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/components/LandingStepPreview.test.tsx`
Expected: FAIL — `Unable to find an element with the text: 근거 패널`

- [ ] **Step 3: `ReviewStepPreview` 를 바꾼다**

`src/components/LandingStepPreview.tsx` 의 `ReviewStepPreview` 를 아래로 교체한다. 파일 나머지(다른 프리뷰 3개, `PreviewFrame`, 상수)는 손대지 않는다. 파일 상단 import 에 아래 한 줄을 추가한다.

```tsx
import { LANDING_INSIGHT_CARDS } from "@/lib/landing-samples";
```

```tsx
/** 3단계 중 마지막. 히어로가 인사이트 문장을 이미 보여주므로 여기서는
    "그 문장을 열면 나오는 것" — 근거가 된 거래 행과 합계를 보여준다. */
export function ReviewStepPreview() {
  const evidence = LANDING_INSIGHT_CARDS[0].evidence;

  return (
    <PreviewFrame label="리뷰 읽기">
      <div className="landing-preview__bar">
        <span className="landing-preview__bar-title">근거 패널</span>
      </div>
      <div className="landing-preview__rows">
        {evidence.rows.slice(0, 3).map((row) => (
          <div className="landing-preview__row" key={row.date + row.merchant}>
            <span className="landing-preview__date tabular-nums">
              {row.date}
            </span>
            <span className="landing-preview__merchant">{row.merchant}</span>
            <span className="landing-preview__amount tabular-nums">
              {row.amount}
            </span>
          </div>
        ))}
        <div className="landing-preview__row landing-preview__row--total">
          <span className="landing-preview__date" />
          <span className="landing-preview__merchant">외 9건</span>
          <span className="landing-preview__amount tabular-nums">
            {evidence.summaryValue}
          </span>
        </div>
      </div>
    </PreviewFrame>
  );
}
```

`.landing-preview__row` 는 4열(날짜·가맹점·카테고리·금액) 그리드다. 여기서는 3개만 넣으므로 총계 행 스타일과 함께 3열로 잡아 준다.

- [ ] **Step 4: CSS를 추가한다**

```css
/* ══════ 랜딩 ④ 근거 패널 미리보기 ══════ */

.landing-preview__rows .landing-preview__row--total {
  border-top: var(--line-width) solid var(--hairline);
  color: var(--text-tertiary);
  padding-top: 6px;
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/components/LandingStepPreview.test.tsx`
Expected: PASS (2건)

Run: `npx vitest run "src/app/(marketing)/page.test.tsx"`
Expected: 기존 3건 실패는 Task 9에서 고친다. **여기서 새로 깨지는 것이 없어야 한다** — `previews the actual screen of each step as a labelled example` 가 통과해야 한다(`aria-label` 을 유지했으므로).

- [ ] **Step 6: 커밋한다**

```bash
git add src/components/LandingStepPreview.tsx src/components/LandingStepPreview.test.tsx src/app/globals.css
git commit -m "feat(landing): 3단계 마지막 미리보기를 근거 패널로 바꾼다"
```

---

### Task 8: 대시보드 쇼케이스 (`DashboardShowcase`)

⑤. 히어로에서 이사한 대시보드를 크게 키우고, 오른쪽 아래에 인사이트 카드가 떠 있다. 그 위에 노란 플래그 "바꿀 지점 5건 중 1".

**Files:**
- Create: `src/components/landing/DashboardShowcase.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/landing/DashboardShowcase.test.tsx`

**Interfaces:**
- Consumes: `LANDING_DASHBOARD`, `LANDING_INSIGHT_CARDS`, `categoryVar` (`@/lib/landing-samples`), `SIGNAL_TYPE_LABELS` (`@/lib/signals/thresholds`), `Highlight`, `Badge`
- Produces: `DashboardShowcase()` — props 없음

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/landing/DashboardShowcase.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardShowcase } from "./DashboardShowcase";

describe("DashboardShowcase", () => {
  it("shows the month total and how it moved against last month", () => {
    render(<DashboardShowcase />);

    expect(screen.getByText("1,136,000원")).toBeInTheDocument();
    expect(screen.getByText("지난달보다 +8.2%")).toBeInTheDocument();
  });

  it("marks the whole dashboard as example data", () => {
    render(<DashboardShowcase />);

    expect(screen.getByText("예시")).toBeInTheDocument();
  });

  it("breaks the total down by category", () => {
    render(<DashboardShowcase />);

    expect(screen.getByText("식비")).toBeInTheDocument();
    expect(screen.getByText("382,000원")).toBeInTheDocument();
    expect(screen.getByText("카페/간식")).toBeInTheDocument();
  });

  it("floats one insight over the dashboard with its rank among the signals", () => {
    render(<DashboardShowcase />);

    expect(screen.getByText("바꿀 지점 5건 중 1")).toBeInTheDocument();
    expect(screen.getByText("구독료 인상")).toBeInTheDocument();
    expect(screen.getByText("연 36,000원")).toBeInTheDocument();
  });

  it("labels the donut for screen readers", () => {
    render(<DashboardShowcase />);

    expect(
      screen.getByRole("img", { name: "카테고리별 지출 비중" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/components/landing/DashboardShowcase.test.tsx`
Expected: FAIL — `Failed to resolve import "./DashboardShowcase"`

- [ ] **Step 3: `DashboardShowcase` 를 쓴다**

`src/components/landing/DashboardShowcase.tsx`:

```tsx
import type { CSSProperties } from "react";

import { Badge } from "@/components/Badge";
import {
  categoryVar,
  LANDING_DASHBOARD,
  LANDING_INSIGHT_CARDS,
} from "@/lib/landing-samples";
import { SIGNAL_TYPE_LABELS } from "@/lib/signals/thresholds";

import { Highlight } from "./Highlight";

const FLOATING = LANDING_INSIGHT_CARDS[1];

export function DashboardShowcase() {
  return (
    <div className="landing-dashwrap">
      <div className="landing-dash">
        <div className="landing-dash__bar">
          <span>{LANDING_DASHBOARD.period}</span>
          <Badge variant="neutral">예시</Badge>
        </div>
        <div className="landing-dash__body">
          <div className="landing-dash__left">
            <span className="landing-kpi-label">이 달 지출</span>
            <span className="landing-kpi-value tabular-nums">
              {LANDING_DASHBOARD.total}
            </span>
            <span className="landing-kpi-delta tabular-nums">
              {LANDING_DASHBOARD.delta}
            </span>
            <div
              aria-label="카테고리별 지출 비중"
              className="landing-donut"
              role="img"
            >
              <span className="landing-donut__hole tabular-nums">
                {LANDING_DASHBOARD.donutTotal}
              </span>
            </div>
          </div>
          <div className="landing-dash__right">
            {LANDING_DASHBOARD.bars.map((bar) => (
              <div className="landing-barrow" key={bar.category}>
                <span className="landing-barname">
                  <span
                    className="landing-sigdot"
                    style={{ background: categoryVar(bar.category) }}
                  />
                  {bar.category}
                </span>
                <span className="landing-track">
                  <span
                    className="landing-fill"
                    style={{
                      background: categoryVar(bar.category),
                      width: `${bar.share}%`,
                    }}
                  />
                </span>
                <span className="landing-baramt tabular-nums">
                  {bar.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <article
        className="landing-floatcard landing-acc"
        style={
          {
            "--landing-accent": categoryVar(FLOATING.category),
          } as CSSProperties
        }
      >
        <div className="landing-floatcard__flag">
          <svg aria-hidden="true" fill="none" height="12" viewBox="0 0 12 12" width="12">
            <path
              d="M6 1v7M6 10.5v.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.6"
            />
          </svg>
          바꿀 지점 5건 중 1
        </div>
        <div className="landing-floatcard__body">
          <div className="landing-icard__head">
            <span className="landing-icard__type">
              <span
                className="landing-sigdot"
                style={{ background: categoryVar(FLOATING.category) }}
              />
              {SIGNAL_TYPE_LABELS[FLOATING.type]}
            </span>
            <span className="landing-icard__impact tabular-nums">
              {FLOATING.impact}
            </span>
          </div>
          <p className="landing-icard__subject">{FLOATING.subject}</p>
          <p className="landing-icard__text">
            구독료가{" "}
            <Highlight evidence="직전 결제 대비 +30.3%">
              9,900원에서 12,900원
            </Highlight>
            으로 올랐습니다.
          </p>
        </div>
      </article>
    </div>
  );
}
```

- [ ] **Step 4: CSS를 추가한다**

```css
/* ══════ 랜딩 ⑤ 대시보드 ══════ */

.landing-dashwrap {
  margin-top: var(--space-lg);
  padding-bottom: 56px;
  position: relative;
}

.landing-dashwrap::before {
  background: radial-gradient(
    52% 60% at 50% 34%,
    var(--landing-glow-a) 0%,
    transparent 72%
  );
  content: "";
  inset: 14% -14% -4% -14%;
  pointer-events: none;
  position: absolute;
}

.landing-dash {
  background: var(--canvas);
  border: var(--line-width) solid var(--hairline);
  border-radius: var(--radius-xl);
  box-shadow: var(--landing-lift-strong);
  overflow: hidden;
  position: relative;
}

.landing-dash__bar {
  align-items: center;
  background: var(--surface-soft);
  border-bottom: var(--line-width) solid var(--hairline-soft);
  color: var(--text-tertiary);
  display: flex;
  font-size: var(--font-size-label);
  font-weight: 600;
  justify-content: space-between;
  letter-spacing: 0.5px;
  padding: 10px var(--space-lg);
}

.landing-dash__body {
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr);
}

.landing-dash__left {
  border-right: var(--line-width) solid var(--hairline-soft);
  padding: var(--space-xl);
}

.landing-kpi-label {
  color: var(--text-tertiary);
  font-size: var(--font-size-label);
  font-weight: 600;
  letter-spacing: 0.5px;
}

.landing-kpi-value {
  color: var(--ink);
  display: block;
  font-size: var(--font-size-kpi-value);
  font-weight: 600;
  letter-spacing: -0.6px;
  margin-top: 6px;
}

.landing-kpi-delta {
  color: var(--brand-red-dark);
  display: block;
  font-size: var(--font-size-body-sm);
  font-weight: 500;
  margin-top: 4px;
}

.landing-donut {
  /* 조각 비율은 LANDING_DASHBOARD.bars 금액에서 나온 것이다 —
     식비 33.6 · 쇼핑 18.8 · 카페/간식 14.8 · 교통 12.9 · 주거/통신 11.3 · 기타 8.6.
     조각 사이 0.6% 의 --canvas 틈은 docs/DESIGN.md "도넛 조각에는 구분선을 넣는다" 규칙이다. */
  background: conic-gradient(
    var(--cat-food) 0 33.6%,
    var(--canvas) 33.6% 34.2%,
    var(--cat-shopping) 34.2% 52.5%,
    var(--canvas) 52.5% 53.1%,
    var(--cat-cafe-snack) 53.1% 67.3%,
    var(--canvas) 67.3% 67.9%,
    var(--cat-transport) 67.9% 80.1%,
    var(--canvas) 80.1% 80.7%,
    var(--cat-housing-telecom) 80.7% 91.4%,
    var(--canvas) 91.4% 92%,
    var(--cat-other) 92% 100%
  );
  border-radius: var(--radius-full);
  display: grid;
  height: 128px;
  margin: var(--space-lg) auto 0;
  place-items: center;
  width: 128px;
}

.landing-donut__hole {
  align-items: center;
  background: var(--canvas);
  border-radius: var(--radius-full);
  color: var(--ink);
  display: grid;
  font-size: var(--font-size-body-sm);
  font-weight: 600;
  height: 82px;
  place-items: center;
  width: 82px;
}

.landing-dash__right {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: var(--space-xl);
}

.landing-barrow {
  align-items: center;
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: 92px minmax(0, 1fr) 82px;
}

.landing-barname {
  align-items: center;
  color: var(--text-secondary);
  display: inline-flex;
  font-size: var(--font-size-body-sm);
  gap: 6px;
}

.landing-track {
  background: var(--surface);
  border-radius: var(--radius-full);
  height: 8px;
  overflow: hidden;
}

.landing-fill {
  border-radius: var(--radius-full);
  display: block;
  height: 100%;
}

.landing-baramt {
  color: var(--ink);
  font-size: var(--font-size-body-sm);
  font-weight: 500;
  text-align: right;
}

.landing-floatcard {
  background: var(--canvas);
  border: var(--line-width) solid var(--hairline-strong);
  border-radius: var(--radius-xl);
  bottom: 0;
  box-shadow: var(--landing-lift);
  overflow: hidden;
  position: absolute;
  right: -6px;
  width: 340px;
}

.landing-floatcard__flag {
  align-items: center;
  background: var(--surface-yellow);
  border-bottom: var(--line-width) solid var(--hairline-soft);
  color: var(--text-secondary);
  display: flex;
  font-size: var(--font-size-label);
  font-weight: 600;
  gap: 6px;
  letter-spacing: 0.5px;
  margin-top: var(--landing-accent-height);
  padding: 8px var(--space-lg);
}

.landing-floatcard__body {
  padding: var(--space-lg);
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/components/landing/DashboardShowcase.test.tsx`
Expected: PASS (5건)

- [ ] **Step 6: 커밋한다**

```bash
git add src/components/landing/DashboardShowcase.tsx src/components/landing/DashboardShowcase.test.tsx src/app/globals.css
git commit -m "feat(landing): 매달 쌓이는 대시보드를 지적 카드와 함께 보여준다"
```

---

### Task 9: `page.tsx` 조립과 페이지 테스트 개정

섹션 7개를 조립하고, "이런 문장을 받게 됩니다" 섹션을 삭제하고, 히어로를 인사이트 스택으로 교체한다. 깨지는 기존 테스트 3건은 **의도를 살려 새 구조로 옮긴다.**

**Files:**
- Modify: `src/app/(marketing)/page.tsx`
- Modify: `src/app/globals.css` (히어로 글로우 · 반응형)
- Test: `src/app/(marketing)/page.test.tsx`

**Interfaces:**
- Consumes: Task 2·4·5·6·8 의 컴포넌트 전부, 기존 `Button` · `PricingCard` · `LandingStepPreview`
- Produces: 없음 (페이지가 최종 소비자다)

- [ ] **Step 1: 깨지는 테스트 3건을 새 구조로 옮긴다**

`src/app/(marketing)/page.test.tsx` 에서 아래 세 `it` 블록을 교체한다. **나머지 11건은 그대로 둔다.**

교체 1 — `renders the finsight wordmark and a tool-sized value proposition heading`:

```tsx
  it("renders the finsight wordmark and leads with what the product tells you", () => {
    render(<Page />);

    expect(screen.getAllByText("finsight").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "문장으로 짚어 드립니다",
    );
    expect(screen.getByText(/카드 명세서 CSV 한 장이면 됩니다/)).toBeInTheDocument();
  });
```

교체 2 — `labels the sample sentences as examples rather than real data`:

```tsx
  it("labels the insight previews as examples rather than real data", () => {
    render(<Page />);

    expect(screen.getAllByText("예시").length).toBeGreaterThanOrEqual(2);
    // 신뢰줄은 <b> 안에 있고 부모 <span>·<p> 의 textContent 에도 같은 문구가 들어간다.
    // 정규식으로 찾으면 세 요소가 매칭되므로 <b> 하나만 잡히는 완전 일치를 쓴다.
    expect(screen.getByText("금액은 계산된 값입니다.")).toBeInTheDocument();
  });
```

교체 3 — `lifts the amount out of each sample sentence so the number reads first`:

```tsx
  it("lifts the impact amount out of each insight card so the number reads first", () => {
    const { container } = render(<Page />);

    const impacts = container.querySelectorAll(".landing-icard__impact");

    expect(impacts).toHaveLength(3);
    impacts.forEach((impact) => {
      expect(impact).toHaveClass("tabular-nums");
      expect(impact.textContent).toMatch(/원/);
    });
  });
```

- [ ] **Step 2: 새 구조를 덮는 테스트를 추가한다**

같은 파일의 `describe` 안에 아래를 추가한다.

```tsx
  it("says the numbers are computed and the AI only writes them into sentences", () => {
    render(<Page />);

    expect(screen.getByText("금액은 계산된 값입니다.")).toBeInTheDocument();
    expect(
      screen.getAllByText(/무엇을 지적할지는 정해진 규칙이 고르고/).length,
    ).toBeGreaterThan(0);
  });

  it("shows the raw signal fields behind the sentence when the toggle is pressed", () => {
    render(<Page />);

    fireEvent.click(screen.getByRole("button", { name: "규칙이 고른 것" }));

    expect(screen.getByText("category_spike")).toBeVisible();
  });

  it("connects an uploaded csv line to the signal it became", () => {
    const { container } = render(<Page />);

    fireEvent.focus(
      screen.getByRole("button", { name: "2026-03-02,스트리밍 구독,12900" }),
    );

    expect(container.querySelector(".landing-transform")).toHaveAttribute(
      "data-focus",
      "sub",
    );
  });

  it("lists every signal type the detector can produce", () => {
    render(<Page />);

    const grid = screen.getByRole("list", { name: "잡는 지적 5종" });

    expect(within(grid).getAllByRole("listitem")).toHaveLength(6);
  });

  it("moves the dashboard preview into its own section", () => {
    render(<Page />);

    expect(
      screen.getByRole("heading", { name: "매달 이 화면이 한 장 쌓입니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1,136,000원")).toBeInTheDocument();
  });

  it("drops the standalone sample sentence section that the hero absorbed", () => {
    render(<Page />);

    expect(
      screen.queryByRole("heading", { name: "이런 문장을 받게 됩니다" }),
    ).not.toBeInTheDocument();
  });
```

`fireEvent` 와 `within` 은 이미 이 파일이 import 하고 있다.

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `npx vitest run "src/app/(marketing)/page.test.tsx"`
Expected: FAIL — 새로 추가한 6건과 교체한 3건이 실패한다(`Unable to find ... 규칙이 고른 것` 등). 손대지 않은 기존 11건은 통과 상태여야 한다.

- [ ] **Step 4: `page.tsx` 를 다시 쓴다**

`MarketingContent` 의 `return` 블록과 상수 부분만 바꾼다. **OAuth 관련 함수 4개(`safeRedirectPath`, `getBrowserOrigin`, `buildCallbackUrl`, `startGoogleOAuth`)와 `formatCurrency`, 요금제 상수는 그대로 둔다.** `SAMPLE_SENTENCES` 상수는 삭제하고, `Badge` 와 `DashboardGlancePreview` import 도 함께 지운다(더 이상 쓰지 않는다).

import 블록을 아래로 바꾼다.

```tsx
"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/Button";
import {
  ClassifyStepPreview,
  ReviewStepPreview,
  UploadStepPreview,
} from "@/components/LandingStepPreview";
import { CsvToSignals } from "@/components/landing/CsvToSignals";
import { DashboardShowcase } from "@/components/landing/DashboardShowcase";
import { InsightCardStack } from "@/components/landing/InsightCardStack";
import { LandingSection } from "@/components/landing/LandingSection";
import { SignalTypeGrid } from "@/components/landing/SignalTypeGrid";
import { PricingCard } from "@/components/PricingCard";
import { createBrowserClient } from "@/services/supabase";
```

`return` 블록을 아래로 바꾼다.

```tsx
  return (
    <div className="landing">
      <header className="landing-header">
        <span className="landing-wordmark">finsight</span>
        <Button onClick={startGoogleOAuth} size="sm">
          구글로 시작하기
        </Button>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero__copy">
            <span className="landing-hero__eyebrow">
              계좌를 연동하지 않는 가계부
            </span>
            <h1 className="landing-hero__title">
              지난달과 뭐가 달라졌는지, 문장으로 짚어 드립니다
            </h1>
            <p className="landing-hero__description">
              카드 명세서 CSV 한 장이면 됩니다. 지출 급증·튀는 결제·구독료
              인상을 찾아 금액과 함께 알려 드립니다.
            </p>
            {authError ? (
              <p className="landing-alert" role="alert">
                {authError}
              </p>
            ) : null}
            {errorMessage ? (
              <p className="landing-alert" role="alert">
                {errorMessage}
              </p>
            ) : null}
            <div className="landing-hero__actions">
              <Button onClick={startGoogleOAuth} size="lg">
                구글로 시작하기
              </Button>
              <p className="landing-hero__note">7일 무료 체험, 카드 등록 없이</p>
            </div>
            <p className="landing-trustline">
              <span>
                <b>금액은 계산된 값입니다.</b> 무엇을 지적할지는 정해진 규칙이
                고르고, AI는 그 숫자를 문장으로 옮기기만 합니다. 오른쪽 토글로
                직접 확인해 보세요.
              </span>
            </p>
          </div>
          <InsightCardStack />
        </section>

        <LandingSection
          hint="어느 쪽이든 짚어 보세요 — 어떤 줄이 어떤 문장이 됐는지 이어집니다"
          label="무엇을 올리나"
          lead="카드사에서 내려받은 CSV를 그대로 올리면 됩니다. 컬럼 이름이 카드사마다 달라도 알아서 읽고, 바꿀 수 있는 지점만 골라 드립니다."
          title="340줄짜리 명세서에서 볼 것은 5줄입니다"
        >
          <CsvToSignals />
        </LandingSection>

        <LandingSection
          label="무엇을 잡나"
          lead="막연한 분석이 아닙니다. 잡는 조건이 숫자로 정해져 있고, 걸린 것만 금액과 함께 문장으로 드립니다."
          title="이 다섯 가지를 놓치지 않습니다"
        >
          <SignalTypeGrid />
        </LandingSection>

        <LandingSection
          label="무엇을 하나"
          lead="가입한 뒤 밟는 순서가 그대로 이 셋입니다. 아래 화면은 예시 데이터로 그린 것이고, 실제 화면은 올린 거래로 채워집니다."
          title="세 단계로 끝납니다"
        >
          <ol aria-label="이용 흐름" className="landing-flow-list">
            {FLOW_STEPS.map((step, index) => (
              <li
                className={`landing-flow landing-flow--${index + 1} landing-lift`}
                key={step.title}
              >
                <div className="landing-flow__head">
                  <span className="landing-flow__index tabular-nums">
                    {index + 1}
                  </span>
                  <h3 className="landing-flow__title">{step.title}</h3>
                </div>
                <p className="landing-flow__doing">{step.doing}</p>
                <p className="landing-flow__system">
                  <span className="landing-flow__system-label">그동안</span>
                  {step.system}
                </p>
                <step.Preview />
              </li>
            ))}
          </ol>
        </LandingSection>

        <LandingSection
          label="무엇을 보나"
          lead="지적만 오는 게 아닙니다. 카테고리별 지출과 지난달 비교가 함께 서고, 지적은 그 위에서 나옵니다."
          title="매달 이 화면이 한 장 쌓입니다"
        >
          <DashboardShowcase />
        </LandingSection>

        <LandingSection
          label="왜 이 방식인가"
          lead="연동하지 못해서가 아니라 연동하지 않기로 했습니다. 가계부 하나를 쓰려고 금융 계정 전체를 넘길 이유가 없습니다."
          title="왜 계좌를 연동하지 않나"
        >
          <ul aria-label="CSV를 쓰는 이유" className="landing-reason-list">
            {CSV_REASONS.map((reason) => (
              <li className="landing-reason landing-lift" key={reason.title}>
                <h3 className="landing-reason__title">{reason.title}</h3>
                <p className="landing-reason__body">{reason.body}</p>
              </li>
            ))}
          </ul>
        </LandingSection>

        <LandingSection
          id="pricing"
          label="얼마인가"
          lead="7일 체험이 끝난 뒤에도 체험 중 만든 대시보드·리뷰·리포트는 계속 볼 수 있습니다. 결제하면 새 업로드와 리포트 생성이 다시 열립니다."
          title="요금제"
        >
          <div className="landing-plan-grid">
            <PricingCard
              amount={formatCurrency(MONTHLY_PRICE_KRW)}
              ctaLabel="구글로 시작하기"
              features={PLAN_FEATURES}
              name="월간"
              onCtaClick={startGoogleOAuth}
              period="1개월"
              variant="standard"
            />
            <PricingCard
              amount={formatCurrency(YEARLY_PRICE_KRW)}
              ctaLabel="구글로 시작하기"
              features={PLAN_FEATURES}
              name="연간"
              onCtaClick={startGoogleOAuth}
              period="1년"
              variant="featured"
            />
          </div>
          <p className="landing-plan-note tabular-nums">
            연간 결제는 월간 결제 {MONTHS_PER_YEAR}개월보다{" "}
            {formatCurrency(savings)} 저렴합니다. 결제는 로그인한 뒤
            대시보드에서 진행합니다.
          </p>
        </LandingSection>
      </main>

      <footer className="landing-footer">
        <span className="landing-wordmark">finsight</span>
        <p className="landing-footer__note">
          CSV 거래내역을 올려 쓰는 개인 가계부입니다. 계좌를 연동하지 않습니다.
        </p>
      </footer>
    </div>
  );
```

**헤더는 지금의 sticky 그대로 둔다.** 시안은 데모 바 때문에 sticky 를 뺀 것이고, 실제 랜딩에서 상단 CTA가 따라오는 편이 낫다. 육안 확인 때 히어로 글로우와 겹쳐 어색하면 그때 정한다.

- [ ] **Step 5: 히어로 글로우와 3단계 진행률 액센트 CSS를 추가한다**

```css
/* ══════ 랜딩 — 히어로 글로우 ══════ */

.landing-hero {
  position: relative;
}

.landing-hero::before {
  background:
    radial-gradient(
      46% 52% at 70% 34%,
      var(--landing-glow-a) 0%,
      transparent 70%
    ),
    radial-gradient(
      40% 44% at 40% 70%,
      var(--landing-glow-b) 0%,
      transparent 72%
    );
  content: "";
  filter: blur(6px);
  inset: -14% -22% 14% 28%;
  pointer-events: none;
  position: absolute;
  z-index: 0;
}

.landing-hero > * {
  position: relative;
  z-index: 1;
}

/* 3단계 카드의 액센트는 장식이 아니라 진행률이다. */
.landing-flow {
  overflow: hidden;
  position: relative;
}

.landing-flow::before {
  background: var(--ink);
  content: "";
  height: var(--landing-accent-height);
  inset-inline-start: 0;
  position: absolute;
  top: 0;
}

.landing-flow--1::before {
  width: 33.3%;
}

.landing-flow--2::before {
  width: 66.6%;
}

.landing-flow--3::before {
  width: 100%;
}

/* 연간 요금제도 액센트를 받는다 — 지적 타일·인사이트 카드와 같은 강조 문법이다.
   카테고리 색이 아니라 --ink 인 이유는 요금제가 카테고리에 속하지 않기 때문이다.
   .pricing-card--featured 는 앱의 요금제 화면도 쓰는 클래스라 랜딩으로 범위를 좁힌다. */
.landing-plan-grid .pricing-card--featured {
  overflow: hidden;
  padding-top: calc(var(--space-xl) + var(--landing-accent-height));
  position: relative;
}

.landing-plan-grid .pricing-card--featured::before {
  background: var(--ink);
  content: "";
  height: var(--landing-accent-height);
  inset-inline: 0;
  position: absolute;
  top: 0;
}
```

- [ ] **Step 6: 900px 아래 반응형을 추가한다**

기존 `@media (max-width: 767px)` 블록(3677줄)은 그대로 두고, `.landing-*` 구간 맨 뒤에 새 블록을 추가한다. 900px 는 시안의 접기 지점이고, 새로 들어온 3열 그리드들이 그 폭에서 먼저 깨진다.

```css
@media (max-width: 900px) {
  .landing-transform {
    gap: var(--space-md);
    grid-template-columns: minmax(0, 1fr);
  }

  .landing-arrow {
    height: 40px;
    transform: rotate(90deg);
  }

  .landing-csvbox {
    height: 170px;
  }

  .landing-sig-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .landing-sig--lead {
    grid-column: span 1;
    grid-template-columns: minmax(0, 1fr);
  }

  .landing-dash__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .landing-dash__left {
    border-bottom: var(--line-width) solid var(--hairline-soft);
    border-right: 0;
  }

  .landing-floatcard {
    margin-top: var(--space-md);
    position: static;
    width: auto;
  }

  .landing-dashwrap {
    padding-bottom: 0;
  }

  .landing-section {
    padding: 48px 0;
  }
}
```

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

Run: `npx vitest run "src/app/(marketing)/page.test.tsx"`
Expected: PASS (20건 전부 — 기존 14건 중 3건 교체 + 신규 6건)

Run: `npm run test && npm run lint && npm run build`
Expected: 전부 성공. 빌드에서 `SAMPLE_SENTENCES` 나 `Badge` 미사용 경고가 나오면 지우지 않은 것이다.

- [ ] **Step 8: 커밋한다**

```bash
git add "src/app/(marketing)/page.tsx" "src/app/(marketing)/page.test.tsx" src/app/globals.css
git commit -m "feat(landing): 인사이트를 앞세운 7개 섹션으로 랜딩을 다시 짠다"
```

---

### Task 10: `docs/DESIGN.md` 개정과 최종 검증

**코드만 고치고 문서를 두면 다음 사람이 원칙대로 되돌린다.** 이 태스크는 구현의 일부지 후속 작업이 아니다.

**Files:**
- Modify: `docs/DESIGN.md` ("랜딩만 쓰는 다섯 값" 절 뒤, 148~164줄 구간의 끝)

- [ ] **Step 1: "랜딩만 허용하는 표현" 절을 넣는다**

`### 랜딩만 쓰는 다섯 값` 절의 마지막 문단(`**랜딩 폭은 --landing-max-width(1040px)다.** …`) 뒤, `## 간격 · 모서리 · 그림자` 앞에 아래를 넣는다.

```markdown
### 랜딩만 허용하는 표현

아래 넷은 **`(marketing)` 라우트에서만** 허용한다. 앱 화면(`(app)/`)의 원칙 — 그림자 거의 없음, 등장 애니메이션 없음 — 은 그대로다. 랜딩은 처음 오는 사람에게 제품을 설명하는 화면이라 눈을 붙잡을 장치가 필요하고, 그 장치가 앱 화면으로 새어 들어가면 매일 여는 화면이 시끄러워진다.

| 표현 | 허용 범위 | 토큰 |
|---|---|---|
| 글로우 | 히어로 뒤·⑤ 대시보드 섹션 뒤 **두 곳뿐** | `--landing-glow-a` `--landing-glow-b` |
| 그림자 | 카드 부양과 hover | `--landing-lift` `--landing-lift-hover` `--landing-lift-strong` |
| 모션 | 카드 스택 순회(4.6초), 3D 뒤집기, 스크롤 진입 1회 | `--landing-ease` |
| `--brand-yellow` 계열 | 숫자 하이라이트 | `--landing-mark` `--landing-mark-line` |

- **격자 패턴·컬러 메시 오브·섹션 교대 밴드는 넣지 않는다.** 검토했다가 전부 뺐다 — 배경이 시끄러우면 카드 위 숫자가 뒤로 밀린다
- **모션은 전부 `prefers-reduced-motion: reduce` 에서 꺼진다.** 자동 순환은 그 설정에서 아예 시작하지 않고, 그렇지 않은 환경에서도 **읽는 사람이 손대는 순간 영구히 멈춘다**
- **`--brand-yellow` 의 사용처가 셋이 됐다** — 만료 배너, 결제 버튼, 그리고 랜딩의 숫자 하이라이트. 랜딩에는 만료 배너가 없어 의미가 충돌하지 않는다. **랜딩의 primary CTA에는 쓰지 않는다**

**섹션은 카드가 아니다.** 개편 전에는 `.landing-section` 이 `--canvas` 카드였지만, 섹션 안에 타일(지적 5종, 3단계, 이유, 요금제)이 들어오면서 카드가 한 단 내려갔다. 섹션은 `--hairline-soft` 구분선과 상하 56px 패딩만 갖는다. 히어로가 카드가 아닌 것은 그대로다.

**카드 상단 액센트 라인은 3px(`--landing-accent-height`)이고 정보를 싣는다.** 인사이트 카드·지적 행·신호 타일은 카테고리 색을, 연간 요금제는 `--ink` 를 쓴다. 3단계 카드만은 액센트를 **진행률**로 쓴다 — 1단계 33%, 2단계 66%, 3단계 100% 너비다.
```

- [ ] **Step 2: 마이그레이션이 없음을 확인한다**

Run: `npx supabase db push --dry-run`
Expected: 새로 올라갈 마이그레이션 없음. 이 작업은 스키마를 건드리지 않는다. (프리플라이트 훅이 push 앞에서 같은 것을 확인한다)

- [ ] **Step 3: 전체 검증을 돌린다**

```bash
npm run test && npm run lint && npm run build
```
Expected: 전부 성공

- [ ] **Step 4: 육안으로 확인한다**

```bash
npm run dev
```

`http://localhost:3000/` 에서 아래를 전부 확인한다. **하나라도 어긋나면 고치고 다시 본다.**

- [ ] 라이트 · 데스크톱 — 히어로 카드 스택이 4.6초마다 넘어가고, 점 3개가 따라 움직인다
- [ ] `규칙이 고른 것` 토글 → 모노스페이스 원자료와 `+58% ≥ 50% ✓` 가 초록으로, 아래 설명줄이 "AI는 아직 아무것도 하지 않았습니다"로 바뀐다
- [ ] `근거 보기 →` → 카드가 3D로 뒤집히고 거래 행 5줄과 합계가 나온다. `← 돌아가기` 로 복귀
- [ ] 숫자에 마우스를 올리면 근거 툴팁이 뜬다. 툴팁이 카드 밖으로 잘리지 않는다
- [ ] ② CSV 줄에 마우스를 올리면 대응 지적만 밝아진다. 지적 쪽에서도 같다. **마우스를 영역 밖으로 빼면 강조가 풀린다**(이 해제 동작은 자동 테스트가 덮지 못한다 — Task 5 참고)
- [ ] **② CSV 박스에서 Tab 을 계속 눌러 9줄을 끝까지 지나가 본다.** `.landing-csvbox` 는 `overflow: hidden` 이고 아래 56px 이 그라디언트로 덮인다 — 뒤쪽 줄에 포커스가 갔는데 그 줄이 화면에 보이지 않거나 focus 링이 잘리면 접근성 결함이다. 그 경우 셋 중 하나로 고친다: 박스 높이를 9줄이 다 들어가게 늘린다 · `overflow-y: auto` 로 바꿔 포커스가 스크롤을 끌고 오게 한다 · 넘치는 줄을 `<button>` 이 아닌 표시용 요소로 바꿔 탭 순서에서 뺀다(단 그러면 그 줄은 짚을 수 없다)
- [ ] ⑦ 연간 요금제 카드 위에 `--ink` 액센트 라인이 있고, 월간 카드에는 없다
- [ ] ③ 타일 6칸(리드 1 + 4종 + 점선), ④ 3단계 액센트가 33/66/100%, ⑤ 떠 있는 카드가 대시보드 오른쪽 아래
- [ ] 다크 · 데스크톱 — 글로우 두 곳이 과하지 않고, 카테고리 색이 대비를 유지한다
- [ ] 라이트 · 모바일(<900px) — CSV↔지적이 세로로 접히고 화살표가 아래를 향한다. 떠 있는 카드가 대시보드 아래로 내려온다
- [ ] 다크 · 모바일
- [ ] **키보드만으로** Tab 순회 — 토글 2개 → 카드 안 하이라이트 → `근거 보기` → 점 3개 → CSV 줄 9개 → 지적 행 3개에 전부 도달하고, focus 링이 보인다
- [ ] macOS 시스템 설정 → 손쉬운 사용 → 디스플레이 → **동작 줄이기 켜기** → 새로고침. 자동 순환이 아예 돌지 않고, 스크롤 진입 애니메이션 없이 처음부터 보인다
- [ ] **섹션 라벨(`● 무엇을 올리나` 등)을 남길지 이 시점에 사용자에게 묻는다** — 승인 때 "구현 후에 보고 정한다"로 미뤄 둔 항목이다. 빼기로 하면 `page.tsx` 의 `label` prop 4개를 지우면 된다

- [ ] **Step 5: 커밋한다**

```bash
git add docs/DESIGN.md
git commit -m "docs(design): 랜딩만 허용하는 표현 네 가지를 못박는다"
```

---

## 완료 조건

- [ ] `npm run test` · `npm run lint` · `npm run build` 전부 통과
- [ ] 라이트/다크 × 데스크톱/모바일 네 조합 육안 확인 완료
- [ ] 키보드만으로 인터랙션 4종에 도달 가능
- [ ] "동작 줄이기"에서 자동 순환·진입 애니메이션 정지 확인
- [ ] `docs/DESIGN.md` 에 "랜딩만 허용하는 표현" 절 반영
- [ ] 섹션 라벨 존치 여부를 사용자에게 확인받음
- [ ] **push 는 사용자 지시를 받고 한다.** 이 작업에 마이그레이션은 없지만 프리플라이트 훅은 그대로 돈다
