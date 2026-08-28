import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingSection } from "./LandingSection";

describe("LandingSection", () => {
  it("renders the label, title and lead above the section body", () => {
    render(
      <LandingSection
        label="무엇을 잡나"
        lead="잡는 조건이 숫자로 정해져 있습니다."
        title="이 다섯 가지를 놓치지 않습니다"
      >
        <p>본문</p>
      </LandingSection>,
    );

    expect(screen.getByText("무엇을 잡나")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "이 다섯 가지를 놓치지 않습니다",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("잡는 조건이 숫자로 정해져 있습니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("본문")).toBeInTheDocument();
  });

  it("omits the label and lead when they are not given", () => {
    const { container } = render(
      <LandingSection title="요금제">
        <p>본문</p>
      </LandingSection>,
    );

    expect(
      container.querySelector(".landing-section__eyebrow"),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector(".landing-section__lead"),
    ).not.toBeInTheDocument();
  });

  it("passes the id through so in-page links keep working", () => {
    const { container } = render(
      <LandingSection id="pricing" title="요금제">
        <p>본문</p>
      </LandingSection>,
    );

    expect(container.querySelector("section")).toHaveAttribute("id", "pricing");
  });
});
