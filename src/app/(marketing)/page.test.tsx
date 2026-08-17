import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Page from "./page";

describe("marketing page", () => {
  it("renders the finsight wordmark", () => {
    render(<Page />);

    expect(
      screen.getByRole("heading", { name: "finsight" }),
    ).toBeInTheDocument();
  });
});
