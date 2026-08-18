import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppSidebar } from "./AppSidebar";

const usePathnameMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

describe("AppSidebar", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the recurring subscriptions route without requiring a selected month", () => {
    usePathnameMock.mockReturnValue("/dashboard/subscriptions");

    render(<AppSidebar email="user@example.com" latestYearMonth={null} />);

    const link = screen.getByRole("link", { name: "반복 지출" });

    expect(link).toHaveAttribute("href", "/dashboard/subscriptions");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});
