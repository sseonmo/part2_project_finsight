"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";

import { ThemeToggle } from "@/components/ThemeToggle";

type AppSidebarProps = {
  email: string | null;
  latestYearMonth: string | null;
};

type NavItem = {
  dotClassName: string;
  href: string | null;
  label: string;
  match: (pathname: string) => boolean;
};

function navItems(latestYearMonth: string | null): NavItem[] {
  return [
    {
      dotClassName: "app-sidebar__dot--dashboard",
      href: "/dashboard",
      label: "대시보드",
      match: (pathname) =>
        pathname === "/dashboard" || pathname.startsWith("/dashboard/uploads"),
    },
    {
      dotClassName: "app-sidebar__dot--transactions",
      href: "/dashboard/transactions",
      label: "거래 목록",
      match: (pathname) => pathname.startsWith("/dashboard/transactions"),
    },
    {
      dotClassName: "app-sidebar__dot--review",
      href: latestYearMonth
        ? `/dashboard/review/${latestYearMonth}`
        : null,
      label: "AI 리뷰",
      match: (pathname) => pathname.startsWith("/dashboard/review"),
    },
    {
      dotClassName: "app-sidebar__dot--report",
      href: latestYearMonth
        ? `/dashboard/report/${latestYearMonth}`
        : null,
      label: "월간 리포트",
      match: (pathname) => pathname.startsWith("/dashboard/report"),
    },
    {
      dotClassName: "app-sidebar__dot--subscriptions",
      href: "/dashboard/subscriptions",
      label: "반복 지출",
      match: (pathname) => pathname.startsWith("/dashboard/subscriptions"),
    },
    {
      dotClassName: "app-sidebar__dot--billing",
      href: "/dashboard/billing",
      label: "요금제",
      match: (pathname) => pathname.startsWith("/dashboard/billing"),
    },
  ];
}

export function AppSidebar({ email, latestYearMonth }: AppSidebarProps) {
  const pathname = usePathname();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function signOut() {
    setErrorMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/auth/signout", { method: "POST" });

      if (!response.ok) {
        setErrorMessage("로그아웃하지 못했습니다. 다시 시도해 주세요.");
        return;
      }

      // router.push 가 아니다. 전체 이동이어야 Next 클라이언트 캐시에 남은
      // 이전 사용자의 화면까지 함께 버려진다.
      window.location.assign("/");
    });
  }

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__top">
        <Link className="app-sidebar__wordmark" href="/dashboard">
          finsight
        </Link>

        <nav aria-label="내 지출" className="app-sidebar__nav">
          <p className="app-sidebar__section-label">내 지출</p>
          {navItems(latestYearMonth).map((item) => {
            const isActive = item.match(pathname);
            const className = [
              "app-sidebar__item",
              isActive ? "app-sidebar__item--active" : null,
              item.href ? null : "app-sidebar__item--disabled",
            ]
              .filter(Boolean)
              .join(" ");
            const content = (
              <>
                <span
                  aria-hidden
                  className={`app-sidebar__dot ${item.dotClassName}`}
                />
                <span className="app-sidebar__item-label">{item.label}</span>
              </>
            );

            return item.href ? (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={className}
                href={item.href}
                key={item.label}
              >
                {content}
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className={className}
                key={item.label}
              >
                {content}
              </span>
            );
          })}
        </nav>
      </div>

      <div className="app-sidebar__bottom">
        <ThemeToggle />
        <Link
          aria-current={pathname === "/settings" ? "page" : undefined}
          className="app-sidebar__user"
          href="/settings"
        >
          <span className="app-sidebar__user-label">설정</span>
          <span className="app-sidebar__user-email">
            {email ?? "이메일 없음"}
          </span>
        </Link>
        <button
          className="app-sidebar__signout"
          disabled={isPending}
          onClick={signOut}
          type="button"
        >
          로그아웃
        </button>
        {errorMessage ? (
          <p className="app-sidebar__signout-error" role="status">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
