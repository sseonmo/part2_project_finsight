import {
  act,
  cleanup,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UploadProgressCard } from "./UploadProgressCard";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const EMPTY_SUMMARY = {
  duplicateCount: 0,
  insertedCount: 0,
  skippedRows: 0,
  uncategorizedCount: 0,
};

function jobResponse(status: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        cardLabelMismatchWarning: null,
        failedReason: null,
        id: "job-1",
        status,
        summary: EMPTY_SUMMARY,
      }),
  };
}

describe("UploadProgressCard", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("refreshes the server data once when polling reaches a terminal status", async () => {
    // 카드만 "처리가 끝났습니다"로 바뀌고 서버 컴포넌트가 그린 집계·월 칩·빈 상태는
    // 그대로 남는 결함이 있었다(KNOWN_ISSUES ⓙ). 폴링이 완료를 만나면 한 번 새로고침한다.
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jobResponse("completed")));

    render(
      <UploadProgressCard
        initialJob={{
          cardLabelMismatchWarning: null,
          failedReason: null,
          id: "job-1",
          status: "parsing",
          summary: EMPTY_SUMMARY,
        }}
      />,
    );

    expect(refreshMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(refreshMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    // 폴링이 멈추므로 더 부르지 않는다 — 새로고침 루프가 되면 안 된다.
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when the job is already terminal on first render", async () => {
    // 서버가 이미 완료 상태로 그린 카드다. 여기서 새로고침하면 렌더마다 다시 돌아
    // 무한 루프가 된다.
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());

    render(
      <UploadProgressCard
        initialJob={{
          cardLabelMismatchWarning: null,
          failedReason: null,
          id: "job-1",
          status: "completed",
          summary: EMPTY_SUMMARY,
        }}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes when polling ends in failure too", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jobResponse("failed")));

    render(
      <UploadProgressCard
        initialJob={{
          cardLabelMismatchWarning: null,
          failedReason: null,
          id: "job-1",
          status: "categorizing",
          summary: EMPTY_SUMMARY,
        }}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(refreshMock).toHaveBeenCalledTimes(1);
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
