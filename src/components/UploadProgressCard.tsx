"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
  createdAt: string;
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

const TERMINAL_LABEL: Record<string, string> = {
  needs_mapping: "어떤 컬럼이 날짜·금액·가맹점인지 알려주세요",
  completed: "처리가 끝났습니다",
  failed: "업로드를 처리하지 못했습니다",
};

// 처리 중 화면에는 퍼센트가 없다. 서버가 진행률을 주지 않으므로 상태 상수로
// 45%·75% 를 꾸며내면 거래가 많은 파일에서 그 숫자가 그대로 거짓말이 된다.
// 진도는 이 세 단계의 체크와, 파싱이 끝나야 확정되는 건수가 대신 보여준다.
const STEPS = [
  {
    status: "pending",
    running: "처리 순서를 기다리는 중",
    done: "파일 업로드",
  },
  {
    status: "parsing",
    running: "거래 내역을 읽는 중",
    done: "거래 내역을 읽었습니다",
  },
  {
    status: "categorizing",
    running: "카테고리를 분류하는 중",
    done: "카테고리를 분류했습니다",
  },
] as const;

const PARSING_STEP_INDEX = 1;
const LONG_RUN_SECONDS = 30;
const LONG_RUN_HINT =
  "거래가 많으면 1~2분 걸릴 수 있습니다. 이 화면을 닫아도 처리는 계속됩니다.";

function formatElapsed(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}초 경과`;
  }

  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");

  return `${minutes}분 ${rest}초 경과`;
}

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
  const isTerminal = TERMINAL_STATUSES.has(job.status);
  const shouldPoll = !isTerminal;

  // 서버 렌더 시점과 클라이언트 시각이 달라 hydration 이 어긋나므로, 현재 시각은
  // 마운트 후에만 읽는다. 기준점은 job 이 만들어진 시각이라 처리 중에 새로고침해도
  // 경과 시간이 0 으로 되돌아가지 않는다.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());

    if (!shouldPoll) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [shouldPoll]);

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

  const elapsedSeconds = useMemo(() => {
    if (now === null) {
      return null;
    }

    const startedAt = Date.parse(job.createdAt);

    if (Number.isNaN(startedAt)) {
      return null;
    }

    return Math.max(0, Math.floor((now - startedAt) / 1000));
  }, [job.createdAt, now]);

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
          <p className="upload-progress-card__message">
            {TERMINAL_LABEL.needs_mapping}
          </p>
          <Link
            className="finsight-button finsight-button--secondary finsight-button--sm"
            href={`/dashboard/uploads/${job.id}/mapping`}
          >
            컬럼 직접 고르기
          </Link>
        </div>
      );
    }

    const currentIndex = STEPS.findIndex((step) => step.status === job.status);

    return (
      <>
        <ol className="upload-steps">
          {STEPS.map((step, index) => {
            const stepState =
              index < currentIndex
                ? "done"
                : index === currentIndex
                  ? "active"
                  : "todo";
            const meta =
              index === PARSING_STEP_INDEX && stepState === "done"
                ? `${job.summary.insertedCount}건`
                : stepState === "active" && elapsedSeconds !== null
                  ? formatElapsed(elapsedSeconds)
                  : null;

            return (
              <li
                className="upload-step"
                data-state={stepState}
                key={step.status}
              >
                <span aria-hidden="true" className="upload-step__icon">
                  <svg className="upload-step__check" viewBox="0 0 12 12">
                    <path d="M2.5 6.2 4.8 8.5 9.5 3.8" />
                  </svg>
                </span>
                <span className="upload-step__label">
                  {stepState === "done" ? step.done : step.running}
                </span>
                {meta ? (
                  <span className="upload-step__meta tabular-nums">{meta}</span>
                ) : null}
                {stepState === "active" ? (
                  <div className="upload-step__bar">
                    <div
                      aria-busy="true"
                      aria-label={step.running}
                      className="processing-bar"
                      role="progressbar"
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
        {elapsedSeconds !== null && elapsedSeconds >= LONG_RUN_SECONDS ? (
          <p className="upload-progress-card__hint">{LONG_RUN_HINT}</p>
        ) : null}
      </>
    );
  }, [elapsedSeconds, job]);

  return (
    <section className="upload-progress-card" data-status={job.status}>
      <div className="upload-progress-card__header">
        <div>
          <h2 className="upload-progress-card__title">명세서 처리</h2>
          {isTerminal ? (
            <p className="upload-progress-card__subtitle">
              {TERMINAL_LABEL[job.status]}
            </p>
          ) : null}
        </div>
        <span className="upload-progress-card__job tabular-nums">
          {job.id}
        </span>
      </div>
      {content}
    </section>
  );
}
