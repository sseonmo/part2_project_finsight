import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InsightDismissButton, OpenUploadButton } from "./DashboardActions";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

describe("dashboard client actions", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("dispatches the upload dialog event", async () => {
    const listener = vi.fn();
    window.addEventListener("finsight:upload-click", listener);
    render(<OpenUploadButton>명세서 올리기</OpenUploadButton>);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "명세서 올리기" }));
    });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("finsight:upload-click", listener);
  });

  it("posts to the dismiss API and refreshes the dashboard", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<InsightDismissButton signalId="signal-1" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "숨기기" }));
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/signals/signal-1/dismiss", {
      method: "POST",
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
