import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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

  it("renders the finsight wordmark", () => {
    render(<Page />);

    expect(
      screen.getByRole("heading", { name: "finsight" }),
    ).toBeInTheDocument();
  });

  it("starts Google OAuth through Supabase with the original redirect path", async () => {
    searchParamsMock.set("redirectTo", "/dashboard/transactions");
    createBrowserClientMock.mockReturnValue({
      auth: {
        signInWithOAuth: signInWithOAuthMock.mockResolvedValue({ error: null }),
      },
    });

    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "구글로 시작하기" }));

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
});
