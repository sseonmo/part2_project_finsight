import Link from "next/link";

import { Badge } from "@/components/Badge";
import type { Entitlement } from "@/lib/entitlement";

type TrialEndingBannerProps = {
  entitlement: Entitlement;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function seoulDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function seoulDayNumber(date: Date): number {
  const [yearText, monthText, dayText] = seoulDateKey(date).split("-");

  if (!yearText || !monthText || !dayText) {
    return Number.NaN;
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function remainingSeoulDays(until: Date, now: Date): number {
  return seoulDayNumber(until) - seoulDayNumber(now);
}

export function TrialEndingBanner({ entitlement }: TrialEndingBannerProps) {
  if (entitlement.state !== "trialing" || !entitlement.trialEndsAt) {
    return null;
  }

  const remainingDays = remainingSeoulDays(entitlement.trialEndsAt, new Date());

  if (!Number.isFinite(remainingDays) || remainingDays < 0 || remainingDays > 2) {
    return null;
  }

  return (
    <div className="app-banner app-banner--trial">
      <div className="app-banner__content">
        <Badge variant="yellow">체험 안내</Badge>
        <p className="app-banner__text">
          {remainingDays === 0
            ? "오늘 체험 기간이 끝납니다."
            : `체험 종료까지 ${remainingDays}일 남았습니다.`}{" "}
          종료 후에는 새 업로드와 수정이 잠깁니다.
        </p>
      </div>
      <Link className="app-banner__link" href="/dashboard/billing">
        요금제 보기
      </Link>
    </div>
  );
}
