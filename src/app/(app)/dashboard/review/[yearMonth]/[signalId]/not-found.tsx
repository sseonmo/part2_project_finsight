"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

function isValidYearMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  const month = Number(value.slice(5, 7));

  return month >= 1 && month <= 12;
}

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default function SignalDetailNotFound() {
  const params = useParams<{ yearMonth?: string | string[] }>();
  const yearMonth = firstParam(params.yearMonth);
  const reviewHref =
    yearMonth && isValidYearMonth(yearMonth)
      ? `/dashboard/review/${yearMonth}`
      : "/dashboard";

  return (
    <section className="signal-detail-not-found">
      <p>이 신호를 찾을 수 없습니다</p>
      <Link
        className="finsight-button finsight-button--secondary finsight-button--sm"
        href={reviewHref}
      >
        리뷰로 돌아가기
      </Link>
    </section>
  );
}
