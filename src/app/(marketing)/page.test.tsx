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

  it("renders the finsight wordmark and leads with what the product tells you", () => {
    render(<Page />);

    expect(screen.getAllByText("finsight").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "문장으로 짚어 드립니다",
    );
    expect(screen.getByText(/카드 명세서 CSV 한 장이면 됩니다/)).toBeInTheDocument();
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

  it("shows the three step flow with the canonical user-action wording", () => {
    render(<Page />);

    const steps = screen.getByRole("list", { name: "이용 흐름" });
    const items = within(steps).getAllByRole("listitem");

    expect(items).toHaveLength(3);
    expect(
      within(steps).getByRole("heading", { name: "명세서 올리기" }),
    ).toBeInTheDocument();
    expect(
      within(steps).getByRole("heading", { name: "분류 확인하기" }),
    ).toBeInTheDocument();
    expect(
      within(steps).getByRole("heading", { name: "리뷰 읽기" }),
    ).toBeInTheDocument();
  });

  it("separates what the user does from what the system does in each step", () => {
    render(<Page />);

    const steps = screen.getByRole("list", { name: "이용 흐름" });
    const items = within(steps).getAllByRole("listitem");

    items.forEach((item) => {
      expect(within(item).getByText("그동안")).toBeInTheDocument();
    });
  });

  it("previews the actual screen of each step as a labelled example", () => {
    render(<Page />);

    const steps = screen.getByRole("list", { name: "이용 흐름" });

    expect(
      within(steps).getByRole("img", { name: "예시 화면 — 명세서 올리기" }),
    ).toBeInTheDocument();
    expect(
      within(steps).getByRole("img", { name: "예시 화면 — 분류 확인하기" }),
    ).toBeInTheDocument();
    expect(
      within(steps).getByRole("img", { name: "예시 화면 — 리뷰 읽기" }),
    ).toBeInTheDocument();
  });

  it("marks the step previews as examples rather than real data", () => {
    render(<Page />);

    expect(
      screen.getByText(/아래 화면은 예시 데이터로 그린 것/),
    ).toBeInTheDocument();
  });

  it("labels the insight previews as examples rather than real data", () => {
    render(<Page />);

    expect(screen.getAllByText("예시").length).toBeGreaterThanOrEqual(2);
    // 신뢰줄은 <b> 안에 있고 부모 <span>·<p> 의 textContent 에도 같은 문구가 들어간다.
    // 정규식으로 찾으면 세 요소가 매칭되므로 <b> 하나만 잡히는 완전 일치를 쓴다.
    expect(screen.getByText("금액은 계산된 값입니다.")).toBeInTheDocument();
  });

  it("lifts the impact amount out of each insight card so the number reads first", () => {
    const { container } = render(<Page />);

    const impacts = container.querySelectorAll(
      ".landing-stack .landing-icard__impact",
    );

    expect(impacts).toHaveLength(3);
    impacts.forEach((impact) => {
      expect(impact).toHaveClass("tabular-nums");
      expect(impact.textContent).toMatch(/원/);
    });
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

  it("says the numbers are computed and the AI only writes them into sentences", () => {
    render(<Page />);

    expect(screen.getByText("금액은 계산된 값입니다.")).toBeInTheDocument();
    expect(
      screen.getAllByText(/무엇을 지적할지는 정해진 규칙이 고르고/).length,
    ).toBeGreaterThan(0);
  });

  it("shows the raw signal fields behind the sentence when the toggle is pressed", () => {
    render(<Page />);

    fireEvent.click(screen.getByRole("button", { name: "규칙이 고른 것" }));

    expect(screen.getByText("category_spike")).toBeVisible();
  });

  it("connects an uploaded csv line to the signal it became", () => {
    const { container } = render(<Page />);

    fireEvent.focus(
      screen.getByRole("button", { name: "2026-03-02,스트리밍 구독,12900" }),
    );

    expect(container.querySelector(".landing-transform")).toHaveAttribute(
      "data-focus",
      "sub",
    );
  });

  it("lists every signal type the detector can produce", () => {
    render(<Page />);

    const grid = screen.getByRole("list", { name: "잡는 지적 5종" });

    expect(within(grid).getAllByRole("listitem")).toHaveLength(6);
  });

  it("moves the dashboard preview into its own section", () => {
    render(<Page />);

    expect(
      screen.getByRole("heading", { name: "매달 이 화면이 한 장 쌓입니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1,136,000원")).toBeInTheDocument();
  });

  it("drops the standalone sample sentence section that the hero absorbed", () => {
    render(<Page />);

    expect(
      screen.queryByRole("heading", { name: "이런 문장을 받게 됩니다" }),
    ).not.toBeInTheDocument();
  });
});
