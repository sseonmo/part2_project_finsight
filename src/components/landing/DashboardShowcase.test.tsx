import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LANDING_INSIGHT_CARDS } from "@/lib/landing-samples";

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

  it("renders the floating card's sentence from the sample data, not a retyped copy", () => {
    render(<DashboardShowcase />);

    const card = LANDING_INSIGHT_CARDS[1];

    // 조각 텍스트에는 앞뒤 공백이 있다(`"구독료가 "`). RTL 은 렌더된 쪽만 정규화하므로
    // 매처도 같은 기준으로 맞춘다.
    for (const part of card.sentence) {
      const node = screen.getByText(part.text.trim());

      expect(node).toBeInTheDocument();
      if (part.kind === "mark") {
        expect(node).toHaveAttribute("aria-describedby");
        expect(screen.getByText(part.evidence)).toBeInTheDocument();
      }
    }
  });

  it("labels the donut for screen readers", () => {
    render(<DashboardShowcase />);

    expect(
      screen.getByRole("img", { name: "카테고리별 지출 비중" }),
    ).toBeInTheDocument();
  });
});
