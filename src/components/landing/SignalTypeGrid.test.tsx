import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SIGNAL_TYPE_LABELS, SIGNAL_TYPES } from "@/lib/signals/thresholds";

import { SignalTypeGrid } from "./SignalTypeGrid";

describe("SignalTypeGrid", () => {
  it("renders every signal type the detector can produce", () => {
    render(<SignalTypeGrid />);

    const grid = screen.getByRole("list", { name: "잡는 지적 5종" });

    SIGNAL_TYPES.forEach((type) => {
      expect(
        within(grid).getByText(SIGNAL_TYPE_LABELS[type]),
      ).toBeInTheDocument();
    });
  });

  it("shows the numeric condition of each type instead of a vague promise", () => {
    render(<SignalTypeGrid />);

    expect(screen.getByText(/전월 대비 50% 이상/)).toBeInTheDocument();
    expect(screen.getByText(/25~35일 간격으로 3회 이상/)).toBeInTheDocument();
  });

  it("leads with the subscription price increase and its yearly impact", () => {
    render(<SignalTypeGrid />);

    const grid = screen.getByRole("list", { name: "잡는 지적 5종" });
    const items = within(grid).getAllByRole("listitem");

    expect(within(items[0]!).getByText("구독료 인상")).toBeInTheDocument();
    expect(within(items[0]!).getByText("연 36,000원")).toBeInTheDocument();
  });

  it("promises to say nothing when nothing was caught", () => {
    render(<SignalTypeGrid />);

    expect(
      screen.getByText(/없는 지적을 지어내지 않습니다/),
    ).toBeInTheDocument();
  });
});
