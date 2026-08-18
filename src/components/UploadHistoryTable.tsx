"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { UploadSummary } from "@/components/UploadSummary";

export type UploadHistoryStatus =
  | "pending"
  | "parsing"
  | "needs_mapping"
  | "categorizing"
  | "completed"
  | "failed";

export type UploadHistoryJob = {
  id: string;
  originalFilename: string;
  cardLabel: string;
  status: UploadHistoryStatus;
  failedReason: string | null;
  insertedCount: number;
  duplicateCount: number;
  skippedRows: number;
  uncategorizedCount: number;
  cardLabelMismatchWarning: string | null;
  dateFormat: string | null;
  dateFormatResolvedBy: "scan" | "assumed-iso" | null;
  createdAt: string;
  transactionCount: number;
  signalCount: number;
};

type UploadHistoryTableProps = {
  canWrite: boolean;
  jobs: UploadHistoryJob[];
};

const STATUS_LABEL: Record<UploadHistoryStatus, string> = {
  pending: "업로드 중",
  parsing: "거래 내역을 읽는 중",
  needs_mapping: "매핑 필요",
  categorizing: "카테고리를 분류하는 중",
  completed: "완료",
  failed: "실패",
};

const STATUS_DETAIL: Record<Exclude<UploadHistoryStatus, "failed">, string> = {
  pending: "job row는 있고 파일은 아직 Storage에 없습니다.",
  parsing: "인코딩 감지와 컬럼 매핑, 행 파싱을 진행합니다.",
  needs_mapping: "어떤 컬럼이 날짜·금액·가맹점인지 알려주세요.",
  categorizing: "거래 저장 후 분류와 신호 탐지를 진행합니다.",
  completed: "처리가 끝났습니다.",
};

const STATUS_BADGE_VARIANT: Record<
  UploadHistoryStatus,
  "neutral" | "yellow" | "teal" | "success"
> = {
  pending: "neutral",
  parsing: "teal",
  needs_mapping: "yellow",
  categorizing: "teal",
  completed: "success",
  failed: "yellow",
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatCount(value: number): string {
  return value.toLocaleString("ko-KR");
}

function dateFormatResolutionLabel(
  resolvedBy: UploadHistoryJob["dateFormatResolvedBy"],
): string | null {
  if (resolvedBy === "scan") {
    return "전체 행을 확인해 판별했습니다";
  }

  if (resolvedBy === "assumed-iso") {
    return "구분되지 않아 이 형식으로 가정했습니다";
  }

  return null;
}

function StatusCell({ job }: { job: UploadHistoryJob }) {
  const detail =
    job.status === "failed"
      ? (job.failedReason ?? "업로드를 처리하지 못했습니다.")
      : STATUS_DETAIL[job.status];

  return (
    <div className="upload-history-status">
      <Badge variant={STATUS_BADGE_VARIANT[job.status]}>
        {STATUS_LABEL[job.status]}
      </Badge>
      <p className="upload-history-status__detail">{detail}</p>
      {job.status === "needs_mapping" ? (
        <Link
          className="finsight-button finsight-button--secondary finsight-button--sm"
          href={`/dashboard/uploads/${job.id}/mapping`}
        >
          컬럼 직접 고르기
        </Link>
      ) : null}
    </div>
  );
}

function CompletionSummaryCell({ job }: { job: UploadHistoryJob }) {
  if (job.status !== "completed") {
    return <span className="upload-history-muted">완료 후 표시됩니다.</span>;
  }

  return (
    <UploadSummary
      cardLabelMismatchWarning={job.cardLabelMismatchWarning}
      summary={{
        duplicateCount: job.duplicateCount,
        insertedCount: job.insertedCount,
        skippedRows: job.skippedRows,
        uncategorizedCount: job.uncategorizedCount,
      }}
    />
  );
}

function DateFormatCell({ job }: { job: UploadHistoryJob }) {
  if (!job.dateFormat) {
    return <span className="upload-history-muted">아직 판별 전</span>;
  }

  const resolutionLabel = dateFormatResolutionLabel(job.dateFormatResolvedBy);

  return (
    <div className="upload-history-date-format">
      <code className="upload-history-date-format__code">{job.dateFormat}</code>
      {resolutionLabel ? (
        <p className="upload-history-date-format__detail">
          {resolutionLabel}
        </p>
      ) : null}
      <p className="upload-history-date-format__recovery">
        형식이 틀렸다면 이 업로드를 삭제하고 다시 올려주세요.
      </p>
    </div>
  );
}

function UploadDeleteButton({
  canWrite,
  job,
  onDeleted,
}: {
  canWrite: boolean;
  job: UploadHistoryJob;
  onDeleted: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!canWrite) {
    return (
      <div className="upload-history-delete">
        <Button disabled size="sm" variant="danger">
          삭제
        </Button>
        <p className="upload-history-delete__hint">
          읽기 전용 상태에서는 업로드를 삭제할 수 없습니다.
        </p>
      </div>
    );
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      [
        `'${job.originalFilename}' 업로드를 삭제합니다.`,
        `이 업로드로 들어온 거래 ${formatCount(job.transactionCount)}건과 신호 ${formatCount(job.signalCount)}건이 함께 사라집니다.`,
        "원본 CSV 파일도 삭제되며 되돌릴 수 없습니다.",
      ].join("\n"),
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/uploads/${job.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("업로드를 삭제하지 못했습니다.");
      }

      onDeleted(job.id);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "업로드를 삭제하지 못했습니다.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="upload-history-delete">
      <Button
        disabled={isDeleting}
        onClick={handleDelete}
        size="sm"
        variant="danger"
      >
        {isDeleting ? "삭제 중" : "삭제"}
      </Button>
      {error ? <p className="upload-history-delete__error">{error}</p> : null}
    </div>
  );
}

export function UploadHistoryTable({
  canWrite,
  jobs,
}: UploadHistoryTableProps) {
  const [visibleJobs, setVisibleJobs] = useState(jobs);

  if (visibleJobs.length === 0) {
    return (
      <section className="dashboard-panel">
        <h2 className="dashboard-section-title">업로드 이력이 없습니다</h2>
        <p className="dashboard-panel__subtitle">
          명세서를 올리면 파일명, 카드, 처리 상태와 날짜 해석 결과가 여기에 쌓입니다.
        </p>
      </section>
    );
  }

  return (
    <div className="upload-history-table-wrap">
      <table className="upload-history-table">
        <thead>
          <tr>
            <th>파일명</th>
            <th>카드</th>
            <th>상태</th>
            <th>완료 요약</th>
            <th>해석한 날짜 형식</th>
            <th>삭제</th>
          </tr>
        </thead>
        <tbody>
          {visibleJobs.map((job) => (
            <tr key={job.id}>
              <td>
                <div className="upload-history-file">
                  <span className="upload-history-file__name">
                    {job.originalFilename}
                  </span>
                  <span className="upload-history-file__created tabular-nums">
                    {formatDateTime(job.createdAt)}
                  </span>
                </div>
              </td>
              <td>{job.cardLabel}</td>
              <td>
                <StatusCell job={job} />
              </td>
              <td>
                <CompletionSummaryCell job={job} />
              </td>
              <td>
                <DateFormatCell job={job} />
              </td>
              <td>
                <UploadDeleteButton
                  canWrite={canWrite}
                  job={job}
                  onDeleted={(deletedId) => {
                    setVisibleJobs((currentJobs) =>
                      currentJobs.filter((currentJob) => currentJob.id !== deletedId),
                    );
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
