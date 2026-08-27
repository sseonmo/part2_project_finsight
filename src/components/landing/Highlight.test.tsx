import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Highlight } from "./Highlight";

describe("Highlight", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the highlighted number reachable by keyboard", () => {
    render(<Highlight evidence="거래 12건을 더한 값">62,000원(+58%)</Highlight>);

    expect(screen.getByText("62,000원(+58%)")).toHaveAttribute("tabindex", "0");
  });

  it("carries the evidence text with the number instead of hiding it", () => {
    render(<Highlight evidence="거래 12건을 더한 값">62,000원(+58%)</Highlight>);

    expect(screen.getByText("거래 12건을 더한 값")).toBeInTheDocument();
  });
});
