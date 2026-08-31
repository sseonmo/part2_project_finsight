import {
  act,
  cleanup,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  UploadProgressCard,
  type UploadJobStatus,
} from "./UploadProgressCard";

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

const JOB_STARTED_AT = "2026-08-31T10:00:00.000Z";

function jobResponse(status: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        cardLabelMismatchWarning: null,
        createdAt: JOB_STARTED_AT,
        failedReason: null,
        id: "job-1",
        status,
        summary: EMPTY_SUMMARY,
      }),
  };
}

function runningJob(status: UploadJobStatus, summary = EMPTY_SUMMARY) {
  return {
    cardLabelMismatchWarning: null,
    createdAt: JOB_STARTED_AT,
    failedReason: null,
    id: "job-1",
    status,
    summary,
  } as const;
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
        initialJob={runningJob("parsing")}
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
        initialJob={runningJob("completed")}
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
        initialJob={runningJob("categorizing")}
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
        initialJob={runningJob("parsing")}
      />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByText("새로 추가된 거래 0건")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("counts elapsed time from the server-side start, not from mount", async () => {
    // 마운트 기준으로 세면 처리 중에 새로고침한 사용자에게 "0초 경과"가 뜬다.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T10:00:14.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jobResponse("parsing")));

    render(<UploadProgressCard initialJob={runningJob("parsing")} />);

    expect(screen.getByText("14초 경과")).toBeInTheDocument();
  });

  it("keeps the elapsed time ticking while the job is still running", async () => {
    // 진행률이 상태 상수라 값이 안 변한다. 1초마다 바뀌는 이 숫자가 처리 중이라는
    // 유일한 증거이므로, 폴링 응답이 같아도 계속 흘러야 한다.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T10:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jobResponse("parsing")));

    render(<UploadProgressCard initialJob={runningJob("parsing")} />);

    expect(screen.getByText("0초 경과")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByText("3초 경과")).toBeInTheDocument();
  });

  it("tells the user processing continues after thirty seconds", async () => {
    // 오래 걸릴 때 같은 파일을 다시 올리거나 새로고침하는 것을 막는다.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T10:00:29.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jobResponse("parsing")));

    render(<UploadProgressCard initialJob={runningJob("parsing")} />);

    const hint = "거래가 많으면 1~2분 걸릴 수 있습니다. 이 화면을 닫아도 처리는 계속됩니다.";
    expect(screen.queryByText(hint)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it("shows how many transactions were read once parsing is done", async () => {
    // inserted_count 는 categorizing 으로 넘어가는 시점에 이미 확정된다.
    // 분류가 도는 동안 이 숫자가 진도의 근거로 남는다.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T10:00:05.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jobResponse("categorizing")));

    render(
      <UploadProgressCard
        initialJob={runningJob("categorizing", {
          ...EMPTY_SUMMARY,
          insertedCount: 142,
        })}
      />,
    );

    expect(screen.getByText("거래 내역을 읽었습니다")).toBeInTheDocument();
    expect(screen.getByText("142건")).toBeInTheDocument();
    expect(screen.getByText("카테고리를 분류하는 중")).toBeInTheDocument();
  });

  it("states the running step only once", async () => {
    // 카드 부제와 진행바 라벨이 같은 문장을 두 번 쓰고 있었다.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T10:00:05.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jobResponse("parsing")));

    render(<UploadProgressCard initialJob={runningJob("parsing")} />);

    expect(screen.getAllByText("거래 내역을 읽는 중")).toHaveLength(1);
  });

  it("links needs_mapping jobs to the manual mapping route without polling", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UploadProgressCard
        initialJob={{ ...runningJob("needs_mapping"), id: "job-2" }}
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
