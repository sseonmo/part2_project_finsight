import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("renders the current upload step label and clamps the fill width", () => {
    render(<ProgressBar label="거래 내역을 읽는 중" value={140} />);

    expect(screen.getByText("거래 내역을 읽는 중")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(screen.getByTestId("progress-bar-fill")).toHaveStyle({
      width: "100%",
    });
  });
});
