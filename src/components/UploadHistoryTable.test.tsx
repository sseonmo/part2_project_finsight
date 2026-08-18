import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  UploadHistoryTable,
  type UploadHistoryJob,
} from "./UploadHistoryTable";

function makeJob(overrides: Partial<UploadHistoryJob> = {}): UploadHistoryJob {
  return {
    cardLabel: overrides.cardLabel ?? "카드 1",
    cardLabelMismatchWarning: overrides.cardLabelMismatchWarning ?? null,
    createdAt: overrides.createdAt ?? "2026-08-18T00:00:00.000Z",
    dateFormat: overrides.dateFormat ?? null,
    dateFormatResolvedBy: overrides.dateFormatResolvedBy ?? null,
    duplicateCount: overrides.duplicateCount ?? 0,
    failedReason: overrides.failedReason ?? null,
    id: overrides.id ?? "job-1",
    insertedCount: overrides.insertedCount ?? 0,
    originalFilename: overrides.originalFilename ?? "card.csv",
    signalCount: overrides.signalCount ?? 0,
    skippedRows: overrides.skippedRows ?? 0,
    status: overrides.status ?? "completed",
    transactionCount: overrides.transactionCount ?? 0,
    uncategorizedCount: overrides.uncategorizedCount ?? 0,
  };
}

describe("UploadHistoryTable", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders completion summary and the resolved date format recovery guidance", () => {
    render(
      <UploadHistoryTable
        canWrite
        jobs={[
          makeJob({
            dateFormat: "DD/MM/YYYY",
            dateFormatResolvedBy: "scan",
            duplicateCount: 2,
            insertedCount: 0,
            skippedRows: 1,
            uncategorizedCount: 3,
          }),
        ]}
      />,
    );

    expect(screen.getByText("새로 추가된 거래 0건")).toBeInTheDocument();
    expect(screen.getByText("중복이라 건너뛴 거래 2건")).toBeInTheDocument();
    expect(screen.getByText("DD/MM/YYYY")).toBeInTheDocument();
    expect(
      screen.getByText("전체 행을 확인해 판별했습니다"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("형식이 틀렸다면 이 업로드를 삭제하고 다시 올려주세요."),
    ).toBeInTheDocument();
  });

  it("links needs_mapping jobs to the manual mapping route and renders failed reasons", () => {
    render(
      <UploadHistoryTable
        canWrite
        jobs={[
          makeJob({ id: "job-map", status: "needs_mapping" }),
          makeJob({
            failedReason: "거래일을 읽을 수 없는 행이 너무 많습니다.",
            id: "job-failed",
            status: "failed",
          }),
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "컬럼 직접 고르기" })).toHaveAttribute(
      "href",
      "/dashboard/uploads/job-map/mapping",
    );
    expect(
      screen.getByText("거래일을 읽을 수 없는 행이 너무 많습니다."),
    ).toBeInTheDocument();
  });

  it("confirms cascade counts before deleting an upload", async () => {
    const confirm = vi.fn(() => true);
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("confirm", confirm);
    vi.stubGlobal("fetch", fetch);

    render(
      <UploadHistoryTable
        canWrite
        jobs={[
          makeJob({
            id: "job-delete",
            originalFilename: "march.csv",
            signalCount: 4,
            transactionCount: 27,
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/uploads/job-delete", {
        method: "DELETE",
      });
    });
    expect(confirm.mock.calls[0]?.[0]).toContain(
      "거래 27건과 신호 4건이 함께 사라집니다.",
    );
    expect(screen.queryByText("march.csv")).not.toBeInTheDocument();
  });

  it("disables deletion for expired users and explains the write gate", () => {
    render(
      <UploadHistoryTable canWrite={false} jobs={[makeJob()]} />,
    );

    expect(screen.getByRole("button", { name: "삭제" })).toBeDisabled();
    expect(
      screen.getByText("읽기 전용 상태에서는 업로드를 삭제할 수 없습니다."),
    ).toBeInTheDocument();
  });
});
