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

const MONTHLY_PRICE_KRW = 4_900;
const YEARLY_PRICE_KRW = 49_000;
const MONTHS_PER_YEAR = 12;

const PLAN_FEATURES = [
  "새 명세서 업로드",
  "월간 리포트 생성",
  "가맹점 분류 수정",
] as const;

const CSV_REASONS = [
  {
    body: "은행·카드사 아이디와 비밀번호를 넘길 일이 없습니다. 카드사에서 내려받은 CSV 파일 하나면 됩니다.",
    title: "계정을 맡기지 않습니다",
  },
  {
    body: "연동해 둔 계좌가 뒤에서 계속 읽히지 않습니다. 올린 파일에 든 거래만 들어갑니다.",
    title: "올린 것만 들어갑니다",
  },
  {
    body: "원본 파일은 업로드 이력에서 언제든 지울 수 있고, 계정을 삭제하면 함께 사라집니다.",
    title: "지우는 것도 본인이 합니다",
  },
] as const;

const FLOW_STEPS = [
  {
    Preview: UploadStepPreview,
    doing: "카드사에서 내려받은 CSV를 그대로 올립니다.",
    system: "컬럼 이름이 카드사마다 달라도 자동으로 알아보고 거래를 읽습니다.",
    title: "명세서 올리기",
  },
  {
    Preview: ClassifyStepPreview,
    doing: "카테고리가 맞는지 보고 틀린 것만 고칩니다.",
    system:
      "가맹점을 10종으로 나누고, 하나를 고치면 같은 가맹점 전부에 반영합니다.",
    title: "분류 확인하기",
  },
  {
    Preview: ReviewStepPreview,
    doing: "지적받은 문장을 열어 근거를 확인합니다.",
    system: "지출 급증·튀는 결제·구독료 인상을 찾아 문장으로 옮깁니다.",
    title: "리뷰 읽기",
  },
] as const;

function formatCurrency(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

function safeRedirectPath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}

function getBrowserOrigin(): string {
  return window.location.origin === "null"
    ? "http://localhost:3000"
    : window.location.origin;
}

function buildCallbackUrl(redirectTo: string | null): string {
  const callbackUrl = new URL("/auth/callback", getBrowserOrigin());
  const safeRedirectTo = safeRedirectPath(redirectTo);

  if (safeRedirectTo) {
    callbackUrl.searchParams.set("redirectTo", safeRedirectTo);
  }

  return callbackUrl.toString();
}

function MarketingContent() {
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const authError = searchParams.get("authError");
  const savings = MONTHLY_PRICE_KRW * MONTHS_PER_YEAR - YEARLY_PRICE_KRW;

  async function startGoogleOAuth() {
    setErrorMessage(null);

    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: buildCallbackUrl(searchParams.get("redirectTo")),
        },
      });

      if (error) {
        setErrorMessage("로그인을 시작하지 못했습니다. 다시 시도해 주세요.");
      }
    } catch {
      setErrorMessage("로그인을 시작하지 못했습니다. 다시 시도해 주세요.");
    }
  }

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
}

export default function Page() {
  return (
    <Suspense>
      <MarketingContent />
    </Suspense>
  );
}
