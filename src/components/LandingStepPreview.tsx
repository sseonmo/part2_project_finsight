import type { CSSProperties, ReactNode } from "react";

import { LANDING_INSIGHT_CARDS } from "@/lib/landing-samples";

const PREVIEW_TRANSACTIONS = [
  { amount: "5,800원", category: "카페/간식", date: "03.14", merchant: "블루보틀 성수" },
  { amount: "12,400원", category: "식비", date: "03.14", merchant: "김밥천국 역삼" },
  { amount: "3,200원", category: "교통", date: "03.13", merchant: "서울교통공사" },
] as const;

const CATEGORY_TOKENS: Record<string, string> = {
  "카페/간식": "var(--cat-cafe-snack)",
  식비: "var(--cat-food)",
  교통: "var(--cat-transport)",
};

function PreviewFrame({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div aria-label={`예시 화면 — ${label}`} className="landing-preview" role="img">
      {children}
    </div>
  );
}

export function UploadStepPreview() {
  return (
    <PreviewFrame label="명세서 올리기">
      <div className="landing-preview__bar">
        <span className="landing-preview__bar-title">명세서 올리기</span>
      </div>
      <div className="landing-preview__body">
        <div className="landing-preview__field">
          <span className="landing-preview__label">CSV 파일</span>
          <span className="landing-preview__file">
            <span className="landing-preview__file-icon" />
            2026-03-신한카드.csv
          </span>
        </div>
        <div className="landing-preview__field">
          <span className="landing-preview__label">카드</span>
          <span className="landing-preview__select">카드 1</span>
        </div>
        <span className="landing-preview__cta">업로드 시작</span>
      </div>
    </PreviewFrame>
  );
}

export function ClassifyStepPreview() {
  return (
    <PreviewFrame label="분류 확인하기">
      <div className="landing-preview__bar">
        <span className="landing-preview__bar-title">거래 3건</span>
      </div>
      <div className="landing-preview__rows">
        {PREVIEW_TRANSACTIONS.map((transaction) => (
          <div className="landing-preview__row" key={transaction.merchant}>
            <span className="landing-preview__date tabular-nums">
              {transaction.date}
            </span>
            <span className="landing-preview__merchant">
              {transaction.merchant}
            </span>
            <span className="landing-preview__category">
              <span
                className="landing-preview__dot"
                style={
                  {
                    background: CATEGORY_TOKENS[transaction.category],
                  } as CSSProperties
                }
              />
              {transaction.category}
            </span>
            <span className="landing-preview__amount tabular-nums">
              {transaction.amount}
            </span>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

const PREVIEW_CATEGORIES = [
  { amount: "382,000원", name: "식비", share: 68, token: "var(--cat-food)" },
  { amount: "214,000원", name: "쇼핑", share: 38, token: "var(--cat-shopping)" },
  {
    amount: "168,000원",
    name: "카페/간식",
    share: 30,
    token: "var(--cat-cafe-snack)",
  },
] as const;

/** 히어로 옆에 놓는 대시보드 요약. "결국 무엇을 보게 되는가"를 한 장으로 답한다. */
export function DashboardGlancePreview() {
  return (
    <PreviewFrame label="대시보드">
      <div className="landing-preview__bar">
        <span className="landing-preview__bar-title">2026년 3월</span>
      </div>
      <div className="landing-preview__glance">
        <div className="landing-preview__kpi">
          <span className="landing-preview__kpi-label">이 달 지출</span>
          <span className="landing-preview__kpi-value tabular-nums">
            1,284,000원
          </span>
          <span className="landing-preview__kpi-delta tabular-nums">
            지난달보다 +8.2%
          </span>
        </div>
        <div className="landing-preview__bars">
          {PREVIEW_CATEGORIES.map((category) => (
            <div className="landing-preview__cat-row" key={category.name}>
              <span className="landing-preview__category-name">
                <span
                  className="landing-preview__dot"
                  style={{ background: category.token } as CSSProperties}
                />
                {category.name}
              </span>
              <span className="landing-preview__track">
                <span
                  className="landing-preview__fill"
                  style={
                    {
                      background: category.token,
                      width: `${category.share}%`,
                    } as CSSProperties
                  }
                />
              </span>
              <span className="landing-preview__amount tabular-nums">
                {category.amount}
              </span>
            </div>
          ))}
        </div>
      </div>
    </PreviewFrame>
  );
}

/** 형제 미리보기 두 개가 모두 3행이라 여기도 3행에서 끊는다 (3열 그리드에서 높이가 맞는다).
    카드가 요약하는 거래는 전부 12건이다 — `sentence` 의 근거 문구("거래 12건을 더한 값")와
    `evidence.summaryLabel`("외 7건 합계" = 5행 + 7)이 같은 값을 가리킨다. 3행을 보여주므로
    남는 건수는 9다. **슬라이스 수나 예시 거래 건수를 고치면 아래 "외 9건"도 함께 고칠 것.** */
const PREVIEW_EVIDENCE_ROWS = 3;

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
        {evidence.rows.slice(0, PREVIEW_EVIDENCE_ROWS).map((row) => (
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
