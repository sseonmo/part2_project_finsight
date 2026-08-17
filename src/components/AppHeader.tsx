"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export type TransactionMonthOption = {
  period: string;
  transactionCount: number;
  yearMonth: string;
};

type HeaderEntitlement = {
  canWrite: boolean;
};

type AppHeaderProps = {
  currentYearMonth: string | null;
  entitlement: HeaderEntitlement;
  months: TransactionMonthOption[];
  onUploadClick?: () => void;
  showMonthPicker: boolean;
  subtitle: string;
  title: string;
};

type PathAwareAppHeaderProps = {
  entitlement: HeaderEntitlement;
  months: TransactionMonthOption[];
};

const DEFAULT_HEADER_CONFIG = {
  showMonthPicker: true,
  subtitle: "월별 지출 흐름과 최근 인사이트를 봅니다.",
  title: "대시보드",
} as const;

const HEADER_CONFIG = [
  {
    match: (pathname: string) => pathname.startsWith("/dashboard/transactions"),
    showMonthPicker: false,
    subtitle: "가맹점 검색과 카테고리 수정을 관리합니다.",
    title: "거래 목록",
  },
  {
    match: (pathname: string) => pathname.startsWith("/dashboard/review"),
    showMonthPicker: true,
    subtitle: "그 달 신호와 근거를 확인합니다.",
    title: "AI 리뷰",
  },
  {
    match: (pathname: string) => pathname.startsWith("/dashboard/report"),
    showMonthPicker: true,
    subtitle: "생성 시각을 기준으로 한 달치 코칭 문단을 봅니다.",
    title: "월간 리포트",
  },
  {
    match: (pathname: string) =>
      pathname.startsWith("/dashboard/subscriptions"),
    showMonthPicker: false,
    subtitle: "반복 지출과 정기 결제 변화를 확인합니다.",
    title: "반복 지출",
  },
  {
    match: (pathname: string) => pathname.startsWith("/dashboard/billing"),
    showMonthPicker: false,
    subtitle: "체험 이후에도 쓰기 기능을 계속 사용합니다.",
    title: "요금제",
  },
  {
    match: (pathname: string) => pathname.startsWith("/dashboard/uploads"),
    showMonthPicker: false,
    subtitle: "명세서 처리 결과와 파일 상태를 확인합니다.",
    title: "업로드 이력",
  },
  {
    match: (pathname: string) => pathname === "/dashboard",
    ...DEFAULT_HEADER_CONFIG,
  },
] as const;

function getHeaderConfig(pathname: string) {
  return (
    HEADER_CONFIG.find((config) => config.match(pathname)) ??
    DEFAULT_HEADER_CONFIG
  );
}

function getPathYearMonth(pathname: string): string | null {
  return pathname.match(/\d{4}-\d{2}/)?.[0] ?? null;
}

function getMonthHref(pathname: string, yearMonth: string): string {
  if (pathname.startsWith("/dashboard/review")) {
    return `/dashboard/review/${yearMonth}`;
  }

  if (pathname.startsWith("/dashboard/report")) {
    return `/dashboard/report/${yearMonth}`;
  }

  return `/dashboard?month=${yearMonth}`;
}

export function AppHeader({
  currentYearMonth,
  entitlement,
  months,
  onUploadClick,
  showMonthPicker,
  subtitle,
  title,
}: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  function handleUploadClick() {
    if (onUploadClick) {
      onUploadClick();
      return;
    }

    window.dispatchEvent(new CustomEvent("finsight:upload-click"));
  }

  return (
    <header className="app-header">
      <div className="app-header__copy">
        <h1 className="app-header__title">{title}</h1>
        <p className="app-header__subtitle">{subtitle}</p>
      </div>

      <div className="app-header__actions">
        {showMonthPicker && months.length > 0 ? (
          <nav aria-label="월 선택" className="app-header__months">
            {months.slice(0, 4).map((month) => {
              const isCurrent = currentYearMonth === month.yearMonth;

              return (
                <Link
                  aria-current={isCurrent ? "page" : undefined}
                  className={[
                    "app-header__month-chip",
                    isCurrent ? "app-header__month-chip--active" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  href={getMonthHref(pathname, month.yearMonth)}
                  key={month.period}
                  title={`${month.transactionCount.toLocaleString("ko-KR")}건`}
                >
                  {month.yearMonth}
                </Link>
              );
            })}
          </nav>
        ) : null}

        {entitlement.canWrite ? (
          <button
            className="finsight-button finsight-button--primary finsight-button--md"
            onClick={handleUploadClick}
            type="button"
          >
            명세서 올리기
          </button>
        ) : (
          <button
            className="finsight-button finsight-button--yellow finsight-button--md"
            onClick={() => router.push("/dashboard/billing")}
            type="button"
          >
            결제하고 계속 쓰기
          </button>
        )}
      </div>
    </header>
  );
}

export function PathAwareAppHeader({
  entitlement,
  months,
}: PathAwareAppHeaderProps) {
  const pathname = usePathname();
  const config = getHeaderConfig(pathname);

  return (
    <AppHeader
      currentYearMonth={
        getPathYearMonth(pathname) ?? months[0]?.yearMonth ?? null
      }
      entitlement={entitlement}
      months={months}
      showMonthPicker={config.showMonthPicker}
      subtitle={config.subtitle}
      title={config.title}
    />
  );
}
