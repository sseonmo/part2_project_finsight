import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PricingCard } from "./PricingCard";

describe("PricingCard", () => {
  it("renders plan copy, features, variant, and CTA state", () => {
    const onCtaClick = vi.fn();

    render(
      <PricingCard
        amount="49,000원"
        ctaLabel="연간으로 결제"
        features={["새 업로드 허용", "리포트 생성 허용"]}
        name="연간"
        onCtaClick={onCtaClick}
        period="1년"
        selected
        variant="featured"
      />,
    );

    const card = screen.getByRole("article", { name: "연간 요금제" });

    expect(card).toHaveClass("pricing-card", "pricing-card--featured");
    expect(card).toHaveAttribute("data-selected", "true");
    expect(screen.getByText("49,000원")).toBeInTheDocument();
    expect(screen.getByText("/ 1년")).toBeInTheDocument();
    expect(screen.getByText("새 업로드 허용")).toBeInTheDocument();
    expect(screen.getByText("리포트 생성 허용")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "연간으로 결제" })).toBeEnabled();
  });
});
