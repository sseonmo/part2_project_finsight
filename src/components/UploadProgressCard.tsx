"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ProgressBar } from "@/components/ProgressBar";
import {
  UploadSummary,
  type UploadSummaryCounts,
} from "@/components/UploadSummary";

export type UploadJobStatus =
  | "pending"
  | "parsing"
  | "needs_mapping"
  | "categorizing"
  | "completed"
  | "failed";

export type UploadJobSnapshot = {
  id: string;
  status: UploadJobStatus;
  failedReason: string | null;
  summary: UploadSummaryCounts;
  cardLabelMismatchWarning: string | null;
};

type UploadProgressCardProps = {
  initialJob: UploadJobSnapshot;
};

const TERMINAL_STATUSES = new Set<UploadJobStatus>([
  "completed",
  "failed",
  "needs_mapping",
]);

const STATUS_LABEL: Record<UploadJobStatus, string> = {
  pending: "업로드 중",
  parsing: "거래 내역을 읽는 중",
  needs_mapping: "어떤 컬럼이 날짜·금액·가맹점인지 알려주세요",
  categorizing: "카테고리를 분류하는 중",
  completed: "처리가 끝났습니다",
  failed: "업로드를 처리하지 못했습니다",
};

const STATUS_PROGRESS: Record<UploadJobStatus, number> = {
  pending: 15,
  parsing: 45,
  needs_mapping: 100,
  categorizing: 75,
  completed: 100,
  failed: 100,
};

async function fetchUploadJob(id: string): Promise<UploadJobSnapshot | null> {
  const response = await fetch(`/api/uploads/${id}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as UploadJobSnapshot;
}

export function UploadProgressCard({
  initialJob,
}: UploadProgressCardProps) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const label = STATUS_LABEL[job.status];
  const isTerminal = TERMINAL_STATUSES.has(job.status);
  const shouldPoll = !isTerminal;

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchUploadJob(job.id).then((nextJob) => {
        if (!nextJob) {
          return;
        }

        setJob(nextJob);

        // 이 카드만 바꾸면 서버 컴포넌트가 그린 집계·월 선택 칩·빈 상태가 그대로 남아
        // "안 들어갔나?" 하고 같은 파일을 다시 올리게 된다. 폴링은 여기서 멈추므로
        // 새로고침도 한 번뿐이고, 되돌아온 카드는 처음부터 터미널이라 다시 부르지 않는다.
        if (TERMINAL_STATUSES.has(nextJob.status)) {
          router.refresh();
        }
      });
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [job.id, router, shouldPoll]);

  const content = useMemo(() => {
    if (job.status === "completed") {
      return (
        <UploadSummary
          cardLabelMismatchWarning={job.cardLabelMismatchWarning}
          summary={job.summary}
        />
      );
    }

    if (job.status === "failed") {
      return (
        <div className="upload-progress-card__terminal">
          <p className="upload-progress-card__message">
            {job.failedReason ?? "업로드 처리를 완료하지 못했습니다."}
          </p>
          <button
            className="finsight-button finsight-button--secondary finsight-button--sm"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("finsight:upload-click"));
            }}
            type="button"
          >
            다시 시도
          </button>
        </div>
      );
    }

    if (job.status === "needs_mapping") {
      return (
        <div className="upload-progress-card__terminal">
          <p className="upload-progress-card__message">{label}</p>
          <Link
            className="finsight-button finsight-button--secondary finsight-button--sm"
            href={`/dashboard/uploads/${job.id}/mapping`}
          >
            컬럼 직접 고르기
          </Link>
        </div>
      );
    }

    return (
      <ProgressBar label={label} value={STATUS_PROGRESS[job.status]} />
    );
  }, [job, label]);

  return (
    <section className="upload-progress-card" data-status={job.status}>
      <div className="upload-progress-card__header">
        <div>
          <h2 className="upload-progress-card__title">명세서 처리</h2>
          <p className="upload-progress-card__subtitle">{label}</p>
        </div>
        <span className="upload-progress-card__job tabular-nums">
          {job.id}
        </span>
      </div>
      {content}
    </section>
  );
}
