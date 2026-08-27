import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

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
