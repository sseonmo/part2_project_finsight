import type { CSSProperties, ReactNode } from "react";

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

export function ReviewStepPreview() {
  return (
    <PreviewFrame label="리뷰 읽기">
      <div className="landing-preview__bar">
        <span className="landing-preview__bar-title">인사이트 카드</span>
      </div>
      <div className="landing-preview__insight">
        <div className="landing-preview__insight-head">
          <span className="landing-preview__insight-type">카테고리 지출 급증</span>
          <span className="landing-preview__insight-impact tabular-nums">
            +62,000원
          </span>
        </div>
        <p className="landing-preview__insight-subject">카페/간식</p>
        <p className="landing-preview__insight-text">
          카페·간식이 지난달보다 62,000원(+58%) 늘었습니다.
        </p>
        <span className="landing-preview__insight-link">근거 보기</span>
      </div>
    </PreviewFrame>
  );
}
