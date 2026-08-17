import {
  act,
  cleanup,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UploadProgressCard } from "./UploadProgressCard";

describe("UploadProgressCard", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("polls every two seconds and stops after a completed status", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "job-1",
          status: "completed",
          failedReason: null,
          summary: {
            insertedCount: 0,
            duplicateCount: 8,
            skippedRows: 0,
            uncategorizedCount: 0,
          },
          cardLabelMismatchWarning: null,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UploadProgressCard
        initialJob={{
          cardLabelMismatchWarning: null,
          failedReason: null,
          id: "job-1",
          status: "parsing",
          summary: {
            duplicateCount: 0,
            insertedCount: 0,
            skippedRows: 0,
            uncategorizedCount: 0,
          },
        }}
      />,
    );

    expect(screen.getAllByText("거래 내역을 읽는 중")).toHaveLength(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByText("새로 추가된 거래 0건")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("links needs_mapping jobs to the manual mapping route without polling", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UploadProgressCard
        initialJob={{
          cardLabelMismatchWarning: null,
          failedReason: null,
          id: "job-2",
          status: "needs_mapping",
          summary: {
            duplicateCount: 0,
            insertedCount: 0,
            skippedRows: 0,
            uncategorizedCount: 0,
          },
        }}
      />,
    );

    expect(
      screen.getAllByText("어떤 컬럼이 날짜·금액·가맹점인지 알려주세요"),
    ).toHaveLength(2);
    expect(screen.getByRole("link", { name: "컬럼 직접 고르기" })).toHaveAttribute(
      "href",
      "/dashboard/uploads/job-2/mapping",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
