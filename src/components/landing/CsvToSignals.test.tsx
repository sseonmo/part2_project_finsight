import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CsvToSignals } from "./CsvToSignals";

describe("CsvToSignals", () => {
  it("shows the raw csv lines next to the signals they became", () => {
    render(<CsvToSignals />);

    expect(
      screen.getByRole("button", { name: "2026-03-02,스트리밍 구독,12900" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /구독료가 3,000원 올랐습니다/ }),
    ).toBeInTheDocument();
  });

  it("says the rest are ordered by won impact", () => {
    render(<CsvToSignals />);

    expect(screen.getByText(/원화 영향도가 큰 순서로/)).toBeInTheDocument();
  });

  it("links a csv line to its signal when the line takes focus", () => {
    const { container } = render(<CsvToSignals />);

    fireEvent.focus(
      screen.getByRole("button", { name: "2026-03-02,스트리밍 구독,12900" }),
    );

    expect(container.querySelector(".landing-transform")).toHaveAttribute(
      "data-focus",
      "sub",
    );
  });

  it("links a signal back to its csv lines when the signal takes focus", () => {
    const { container } = render(<CsvToSignals />);

    fireEvent.focus(
      screen.getByRole("button", { name: /카페·간식이 58% 늘었습니다/ }),
    );

    expect(container.querySelector(".landing-transform")).toHaveAttribute(
      "data-focus",
      "cafe",
    );
  });

  it("switches the link when another pair is picked", () => {
    const { container } = render(<CsvToSignals />);
    const transform = container.querySelector(".landing-transform");

    fireEvent.click(
      screen.getByRole("button", { name: "2026-03-06,메가박스 코엑스,180000" }),
    );
    expect(transform).toHaveAttribute("data-focus", "outlier");

    fireEvent.click(
      screen.getByRole("button", { name: "2026-03-04,블루보틀 성수,6800" }),
    );
    expect(transform).toHaveAttribute("data-focus", "cafe");
  });

  it("does not link the lines that no signal caught", () => {
    const { container } = render(<CsvToSignals />);

    fireEvent.click(
      screen.getByRole("button", { name: "2026-03-09,올리브영,31900" }),
    );

    expect(container.querySelector(".landing-transform")).not.toHaveAttribute(
      "data-focus",
    );
  });

  it("marks the focused signal and its csv line as pressed", () => {
    render(<CsvToSignals />);

    fireEvent.focus(
      screen.getByRole("button", { name: /구독료가 3,000원 올랐습니다/ }),
    );

    expect(
      screen.getByRole("button", { name: /구독료가 3,000원 올랐습니다/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "2026-03-02,스트리밍 구독,12900" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("leaves the rest unpressed while one pair is linked", () => {
    render(<CsvToSignals />);

    fireEvent.focus(
      screen.getByRole("button", { name: /구독료가 3,000원 올랐습니다/ }),
    );

    expect(
      screen.getByRole("button", { name: /카페·간식이 58% 늘었습니다/ }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: "2026-03-01,스타벅스 역삼,5100" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("does not mark any button pressed when an unmatched csv line is picked", () => {
    render(<CsvToSignals />);

    fireEvent.click(
      screen.getByRole("button", { name: "2026-03-09,올리브영,31900" }),
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("aria-pressed", "false");
    }
  });
});
