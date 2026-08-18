import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransactionCategorySelect } from "./TransactionCategorySelect";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

describe("TransactionCategorySelect", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("posts a merchant-level category override and shows saved feedback", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <TransactionCategorySelect
        category="식비"
        disabled={false}
        merchantNormalized="스타벅스"
      />,
    );

    await act(async () => {
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "카페/간식" },
      });
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/transactions/category", {
      body: JSON.stringify({
        merchantNormalized: "스타벅스",
        category: "카페/간식",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("저장 완료")).toHaveClass(
      "finsight-badge--success",
    );
  });

  it("disables category edits for read-only users", () => {
    render(
      <TransactionCategorySelect
        category="식비"
        disabled
        merchantNormalized="스타벅스"
      />,
    );

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
