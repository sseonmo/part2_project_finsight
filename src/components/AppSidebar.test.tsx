import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "./AppSidebar";

const usePathnameMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

function stubLocation() {
  const assign = vi.fn();

  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign },
  });

  return assign;
}

describe("AppSidebar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the recurring subscriptions route without requiring a selected month", () => {
    usePathnameMock.mockReturnValue("/dashboard/subscriptions");

    render(<AppSidebar email="user@example.com" latestYearMonth={null} />);

    const link = screen.getByRole("link", { name: "반복 지출" });

    expect(link).toHaveAttribute("href", "/dashboard/subscriptions");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("ends the session through the route and leaves for the landing page", async () => {
    usePathnameMock.mockReturnValue("/dashboard");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const assign = stubLocation();

    render(<AppSidebar email="user@example.com" latestYearMonth={null} />);

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/signout", {
        method: "POST",
      });
    });
    // router.push 가 아니라 전체 이동이어야 Next 클라이언트 캐시에 남은
    // 이전 사용자의 화면이 함께 버려진다.
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("/");
    });
  });

  it("keeps the user in place and explains when signing out fails", async () => {
    usePathnameMock.mockReturnValue("/dashboard");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const assign = stubLocation();

    render(<AppSidebar email="user@example.com" latestYearMonth={null} />);

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(
      await screen.findByText("로그아웃하지 못했습니다. 다시 시도해 주세요."),
    ).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });
});
