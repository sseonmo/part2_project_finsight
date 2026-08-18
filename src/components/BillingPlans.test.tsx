import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BillingPlans } from "./BillingPlans";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

describe("BillingPlans", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("calculates and renders the yearly savings from the plan prices", () => {
    render(
      <BillingPlans
        checkoutSuccess={false}
        entitlement={{
          state: "trialing",
          trialEndsAt: new Date("2026-08-24T00:00:00.000Z"),
        }}
      />,
    );

    expect(
      screen.getByText("연간 결제는 월간 결제 12개월보다 9,800원 저렴합니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("2026.08.24까지 체험 중")).toBeInTheDocument();
  });

  it("starts checkout through the route instead of calling Polar directly", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          checkoutUrl: "https://polar.test/checkout/session",
        }),
      ok: true,
    });
    vi.stubGlobal("fetch", fetchMock);
    const assignMock = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { assign: assignMock },
    });

    render(
      <BillingPlans
        checkoutSuccess={false}
        entitlement={{
          state: "expired",
          trialEndsAt: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "월간으로 결제" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/billing/checkout", {
        body: JSON.stringify({ plan: "monthly" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    });
    expect(assignMock).toHaveBeenCalledWith("https://polar.test/checkout/session");
  });

  it("polls by refreshing for at most 30 seconds after returning from checkout", async () => {
    vi.useFakeTimers();

    render(
      <BillingPlans
        checkoutSuccess
        entitlement={{
          state: "expired",
          trialEndsAt: null,
        }}
      />,
    );

    expect(screen.getByText("결제를 확인하는 중")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(refreshMock).toHaveBeenCalledTimes(10);
    expect(
      screen.getByText("곧 반영됩니다. 새로고침해 주세요"),
    ).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });

    expect(refreshMock).toHaveBeenCalledTimes(10);
  });
});
