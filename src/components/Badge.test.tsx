import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders the requested variant as a pill badge", () => {
    render(<Badge variant="teal">자동 추론</Badge>);

    const badge = screen.getByText("자동 추론");

    expect(badge).toHaveClass(
      "finsight-badge",
      "finsight-badge--teal",
    );
  });
});
