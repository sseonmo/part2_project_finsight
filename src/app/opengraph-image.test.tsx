import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import OpengraphImage, { alt, contentType, size } from "./opengraph-image";

describe("opengraph image", () => {
  it("declares the Next.js file convention exports", () => {
    expect(size).toEqual({ height: 630, width: 1200 });
    expect(contentType).toBe("image/png");
    expect(alt).toBe("finsight");
    expect(typeof OpengraphImage).toBe("function");
  });

  it("derives from the wordmark instead of an invented mark", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/opengraph-image.tsx"),
      "utf8",
    );

    expect(source).toContain("finsight");
    // 이미지 안에는 워드마크 말고 다른 글자를 넣지 않는다. 한글을 넣으면
    // ImageResponse 가 Pretendard(WOFF2)를 못 읽어 두부 글자가 렌더된다.
    expect(source).not.toMatch(/[가-힣]+<\//);
  });

  it("keeps the favicon a wordmark letterform with no invented mark", () => {
    const icon = readFileSync(
      resolve(process.cwd(), "src/app/icon.svg"),
      "utf8",
    );

    expect(icon).toContain(">f</text>");
    expect(icon).toContain("prefers-color-scheme: dark");
  });
});
