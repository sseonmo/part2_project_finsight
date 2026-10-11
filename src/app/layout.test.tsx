import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "pretendard-variable" }),
}));

import RootLayout from "./layout";

describe("RootLayout", () => {
  it("puts the font variable class on <html> so :root tokens can resolve it", () => {
    // globals.css 의 :root 가 --font-core: var(--font-pretendard) 로 참조한다.
    // CSS 변수는 선언된 요소에서 계산되므로 클래스가 <body> 에 있으면
    // :root 에서 --font-pretendard 가 비어 Pretendard 가 화면에 쓰이지 않는다.
    const markup = renderToStaticMarkup(RootLayout({ children: null }));

    expect(markup).toMatch(/<html[^>]*class="pretendard-variable"/);
    expect(markup).not.toMatch(/<body[^>]*class="pretendard-variable"/);
  });
});
