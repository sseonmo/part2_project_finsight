import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Page from "./page";

const signInWithOAuthMock = vi.hoisted(() => vi.fn());
const createBrowserClientMock = vi.hoisted(() => vi.fn());
const searchParamsMock = vi.hoisted(() => new URLSearchParams());

vi.mock("@/services/supabase", () => ({
  createBrowserClient: createBrowserClientMock,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock,
}));

describe("marketing page", () => {
  afterEach(() => {
    cleanup();
    searchParamsMock.delete("redirectTo");
    searchParamsMock.delete("authError");
    vi.clearAllMocks();
  });

  it("renders the finsight wordmark and a tool-sized value proposition heading", () => {
    render(<Page />);

    expect(screen.getAllByText("finsight").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { level: 1 }).textContent,
    ).toContain("CSV");
  });

  it("starts Google OAuth through Supabase with the original redirect path", async () => {
    searchParamsMock.set("redirectTo", "/dashboard/transactions");
    createBrowserClientMock.mockReturnValue({
      auth: {
        signInWithOAuth: signInWithOAuthMock.mockResolvedValue({ error: null }),
      },
    });

    render(<Page />);
    fireEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "구글로 시작하기",
      }),
    );

    await waitFor(() => {
      expect(signInWithOAuthMock).toHaveBeenCalledWith({
        provider: "google",
        options: {
          redirectTo:
            "http://localhost:3000/auth/callback?redirectTo=%2Fdashboard%2Ftransactions",
        },
      });
    });
  });

  it("shows a readable auth callback error from the query string", () => {
    searchParamsMock.set("authError", "로그인을 완료하지 못했습니다.");

    render(<Page />);

    expect(screen.getByText("로그인을 완료하지 못했습니다.")).toBeInTheDocument();
  });

  it("states that the trial needs no card", () => {
    render(<Page />);

    expect(screen.getByText(/7일 무료 체험/)).toBeInTheDocument();
    expect(screen.getByText(/카드 등록 없이/)).toBeInTheDocument();
  });

  it("explains why the product reads CSV instead of linking accounts", () => {
    render(<Page />);

    expect(
      screen.getByRole("heading", { name: /계좌를 연동하지 않/ }),
    ).toBeInTheDocument();
  });

  it("shows the three step flow", () => {
    render(<Page />);

    const steps = screen.getByRole("list", { name: "이용 흐름" });

    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
  });

  it("labels the sample sentences as examples rather than real data", () => {
    render(<Page />);

    const samples = screen.getByRole("list", { name: "예시 문장" });
    const items = within(samples).getAllByRole("listitem");

    expect(items).toHaveLength(3);
    items.forEach((item) => {
      expect(within(item).getByText("예시")).toBeInTheDocument();
    });
    expect(
      screen.getByText(/실제 사용자 데이터가 아니라 예시 문장/),
    ).toBeInTheDocument();
  });

  it("prices both plans from the PRD", () => {
    render(<Page />);

    expect(screen.getByText("4,900원")).toBeInTheDocument();
    expect(screen.getByText("49,000원")).toBeInTheDocument();
  });

  it("sends both pricing CTAs to Google login instead of opening checkout", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    createBrowserClientMock.mockReturnValue({
      auth: {
        signInWithOAuth: signInWithOAuthMock.mockResolvedValue({ error: null }),
      },
    });

    render(<Page />);

    const monthly = screen.getByRole("article", { name: "월간 요금제" });
    const yearly = screen.getByRole("article", { name: "연간 요금제" });

    fireEvent.click(
      within(monthly).getByRole("button", { name: "구글로 시작하기" }),
    );
    fireEvent.click(
      within(yearly).getByRole("button", { name: "구글로 시작하기" }),
    );

    await waitFor(() => {
      expect(signInWithOAuthMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("surfaces a readable error when OAuth cannot start", async () => {
    createBrowserClientMock.mockReturnValue({
      auth: {
        signInWithOAuth: signInWithOAuthMock.mockResolvedValue({
          error: new Error("boom"),
        }),
      },
    });

    render(<Page />);
    fireEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "구글로 시작하기",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("로그인을 시작하지 못했습니다. 다시 시도해 주세요."),
      ).toBeInTheDocument();
    });
  });
});
