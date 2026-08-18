import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ManualMappingForm } from "./ManualMappingForm";

const pushMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const PREVIEW_BODY = {
  header: ["승인일", "금액", "가맹점명", "상태"],
  mappingAttemptCount: 2,
  remainingAttempts: 1,
  rows: [
    ["2026-03-01", "5100", "스타벅스", "승인"],
    ["2026-03-02", "12000", "김밥천국", "승인"],
  ],
};

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

async function renderLoadedForm(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  render(
    <ManualMappingForm
      initialErrorMessage={null}
      originalFilename="march.csv"
      uploadId="job-1"
    />,
  );

  expect(await screen.findByText("남은 시도 1회")).toBeInTheDocument();
}

describe("ManualMappingForm", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("loads the preview, shows remaining attempts, and highlights selected columns", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse(PREVIEW_BODY),
    );

    await renderLoadedForm(fetchMock);

    fireEvent.change(screen.getByLabelText("날짜 컬럼"), {
      target: { value: "승인일" },
    });

    expect(screen.getByText(/march\.csv 파일/)).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "승인일" })).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(screen.getByText("2026-03-01")).toHaveClass(
      "manual-mapping-preview__date-like",
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/uploads/job-1/preview", {
      cache: "no-store",
    });
  });

  it("shows the required-column error before posting an incomplete mapping", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse(PREVIEW_BODY),
    );

    await renderLoadedForm(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "매핑 확정" }));

    expect(
      screen.getByText("날짜, 금액, 가맹점 컬럼을 모두 골라주세요"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels the upload when the mapping attempt cap returns 422", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse(PREVIEW_BODY))
      .mockResolvedValueOnce(
        mockJsonResponse({ error: "이 파일은 읽을 수 없습니다." }, 422),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await renderLoadedForm(fetchMock);

    fireEvent.change(screen.getByLabelText("날짜 컬럼"), {
      target: { value: "승인일" },
    });
    fireEvent.change(screen.getByLabelText("금액 컬럼"), {
      target: { value: "금액" },
    });
    fireEvent.change(screen.getByLabelText("가맹점 컬럼"), {
      target: { value: "가맹점명" },
    });
    fireEvent.click(screen.getByRole("button", { name: "매핑 확정" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        3,
        "/api/uploads/job-1",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
    expect(await screen.findByText("이 파일은 읽을 수 없습니다")).toBeInTheDocument();
    expect(screen.getByText("업로드 취소 완료")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "매핑 확정" })).toBeDisabled();
  });
});
