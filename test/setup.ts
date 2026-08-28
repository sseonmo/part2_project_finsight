import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// vitest.config.ts 에 test.globals 가 없어서(의도적 — 켜면 저장소 전체의 import
// 관행이 바뀐다) afterEach 가 전역에 없고, Testing Library 의 자동 cleanup 은
// globalThis.afterEach 가 있을 때만 스스로 등록된다. 그래서 여기서 명시적으로
// 등록해야 각 it() 이 렌더한 DOM 이 다음 테스트로 새지 않는다. 지우지 말 것 —
// 개별 테스트 파일의 수동 afterEach(() => cleanup()) 은 중복이라도 무해하니 그대로 둔다.
afterEach(() => {
  cleanup();
});

// jsdom 에는 둘 다 없다. 랜딩 컴포넌트가 prefers-reduced-motion 을 읽고
// 스크롤 진입을 관찰하므로 테스트 환경에서도 존재해야 한다.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

if (!window.IntersectionObserver) {
  window.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds = [] as const;
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}
