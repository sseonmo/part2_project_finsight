import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardShowcase } from "./DashboardShowcase";

describe("DashboardShowcase", () => {
  it("shows the month total and how it moved against last month", () => {
    render(<DashboardShowcase />);

    expect(screen.getByText("1,136,000원")).toBeInTheDocument();
    expect(screen.getByText("지난달보다 +8.2%")).toBeInTheDocument();
  });

  it("marks the whole dashboard as example data", () => {
    render(<DashboardShowcase />);

    expect(screen.getByText("예시")).toBeInTheDocument();
  });

  it("breaks the total down by category", () => {
    render(<DashboardShowcase />);

    expect(screen.getByText("식비")).toBeInTheDocument();
    expect(screen.getByText("382,000원")).toBeInTheDocument();
    expect(screen.getByText("카페/간식")).toBeInTheDocument();
  });

  it("floats one insight over the dashboard with its rank among the signals", () => {
    render(<DashboardShowcase />);

    expect(screen.getByText("바꿀 지점 5건 중 1")).toBeInTheDocument();
    expect(screen.getByText("구독료 인상")).toBeInTheDocument();
    expect(screen.getByText("연 36,000원")).toBeInTheDocument();
  });

  it("labels the donut for screen readers", () => {
    render(<DashboardShowcase />);

    expect(
      screen.getByRole("img", { name: "카테고리별 지출 비중" }),
    ).toBeInTheDocument();
  });
});
