import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InsightCardStack } from "./InsightCardStack";

describe("InsightCardStack", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders three example insight cards with type, impact and sentence", () => {
    render(<InsightCardStack />);

    const cards = screen.getAllByRole("article");

    expect(cards).toHaveLength(3);
    expect(within(cards[0]!).getByText("카테고리 급증")).toBeInTheDocument();
    expect(within(cards[0]!).getByText("+62,000원")).toBeInTheDocument();
    // 문장은 <span> 조각으로 쪼개져 있고 부모 <p> 의 textContent 도 같은 정규식에
    // 걸린다. 요소가 둘이므로 getByText 는 쓸 수 없다.
    expect(
      within(cards[0]!).getAllByText(/카페·간식이 지난달보다/).length,
    ).toBeGreaterThan(0);
  });

  it("marks the stack as example data", () => {
    render(<InsightCardStack />);

    expect(screen.getByText("예시")).toBeInTheDocument();
  });

  it("starts on the AI sentence view and hides the raw signal view", () => {
    render(<InsightCardStack />);

    expect(
      screen.getByRole("button", { name: "AI가 옮긴 문장" }),
    ).toHaveAttribute("aria-pressed", "true");
    // 원자료는 DOM 에 있되 hidden 이다 — 토글이 두 뷰를 오가므로 언마운트하지 않는다.
    expect(screen.getByText("category_spike")).not.toBeVisible();
  });

  it("swaps the sentence for the raw signal fields when the toggle is pressed", () => {
    render(<InsightCardStack />);

    fireEvent.click(screen.getByRole("button", { name: "규칙이 고른 것" }));

    expect(screen.getByText("category_spike")).toBeVisible();
    expect(
      screen.getByText("src/lib/signals/detect-category-spike.ts"),
    ).toBeVisible();
    expect(screen.getAllByText(/카페·간식이 지난달보다/)[0]).not.toBeVisible();
  });

  it("shows the threshold comparison from the thresholds file in the raw view", () => {
    render(<InsightCardStack />);

    fireEvent.click(screen.getByRole("button", { name: "규칙이 고른 것" }));

    expect(screen.getByText(/≥ 50%/)).toBeVisible();
    expect(screen.getByText(/≥ 30,000/)).toBeVisible();
  });

  it("says the AI has not done anything yet while showing raw fields", () => {
    render(<InsightCardStack />);

    fireEvent.click(screen.getByRole("button", { name: "규칙이 고른 것" }));

    expect(
      screen.getByText(/AI는 아직 아무것도 하지 않았습니다/),
    ).toBeInTheDocument();
  });

  it("reveals the transactions behind the amount when the card is flipped", () => {
    render(<InsightCardStack />);

    const cards = screen.getAllByRole("article");

    fireEvent.click(
      within(cards[0]!).getByRole("button", { name: "근거 보기 →" }),
    );

    expect(cards[0]!).toHaveClass("landing-icard--flipped");
    expect(within(cards[0]!).getByText("이 금액을 만든 거래")).toBeVisible();
    // 근거 목록에는 같은 가맹점이 두 번(03.04, 03.14) 등장한다 — getByText 는 쓸 수 없다.
    expect(within(cards[0]!).getAllByText("블루보틀 성수")[0]).toBeVisible();
    expect(within(cards[0]!).getByText("168,000원")).toBeVisible();
  });

  it("flips the card back", () => {
    render(<InsightCardStack />);

    const cards = screen.getAllByRole("article");

    fireEvent.click(
      within(cards[0]!).getByRole("button", { name: "근거 보기 →" }),
    );
    fireEvent.click(
      within(cards[0]!).getByRole("button", { name: "← 돌아가기" }),
    );

    expect(cards[0]!).not.toHaveClass("landing-icard--flipped");
  });

  it("keeps the hidden card face out of the tab order", () => {
    const { container } = render(<InsightCardStack />);

    const cards = container.querySelectorAll(".landing-icard");
    const front = cards[0]!.querySelector(".landing-icard__face--front")!;
    const back = cards[0]!.querySelector(".landing-icard__face--back")!;

    // 뒷면은 180도 돌아가 눈에 보이지 않는다 — Tab 이 그리로 가면 포커스를 잃는다.
    expect(back).toHaveAttribute("inert");
    expect(front).not.toHaveAttribute("inert");

    fireEvent.click(
      within(cards[0]! as HTMLElement).getByRole("button", {
        name: "근거 보기 →",
      }),
    );

    expect(front).toHaveAttribute("inert");
    expect(back).not.toHaveAttribute("inert");
  });

  it("rotates to the next card on its own", () => {
    render(<InsightCardStack />);

    expect(screen.getAllByRole("article")[0]).toHaveAttribute("data-pos", "0");

    act(() => {
      vi.advanceTimersByTime(4600);
    });

    expect(screen.getAllByRole("article")[0]).toHaveAttribute("data-pos", "2");
  });

  it("stops rotating for good once the reader touches it", () => {
    render(<InsightCardStack />);

    fireEvent.click(screen.getByRole("button", { name: "예시 2" }));

    expect(screen.getAllByRole("article")[1]).toHaveAttribute("data-pos", "0");

    act(() => {
      vi.advanceTimersByTime(4600 * 3);
    });

    expect(screen.getAllByRole("article")[1]).toHaveAttribute("data-pos", "0");
  });
});
