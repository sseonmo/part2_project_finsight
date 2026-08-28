import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewStepPreview } from "./LandingStepPreview";

describe("ReviewStepPreview", () => {
  it("previews the evidence panel behind a sentence, not the sentence itself", () => {
    render(<ReviewStepPreview />);

    const frame = screen.getByRole("img", { name: "예시 화면 — 리뷰 읽기" });

    expect(within(frame).getByText("근거 패널")).toBeInTheDocument();
    expect(within(frame).getByText("블루보틀 성수")).toBeInTheDocument();
    expect(within(frame).getByText("6,800원")).toBeInTheDocument();
  });

  it("closes the panel with the total that the transactions add up to", () => {
    render(<ReviewStepPreview />);

    const frame = screen.getByRole("img", { name: "예시 화면 — 리뷰 읽기" });

    expect(within(frame).getByText("외 9건")).toBeInTheDocument();
    expect(within(frame).getByText("168,000원")).toBeInTheDocument();
  });
});
