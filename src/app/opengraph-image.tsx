import { ImageResponse } from "next/og";

export const alt = "finsight";
export const contentType = "image/png";
export const size = {
  height: 630,
  width: 1200,
};

// 워드마크에서 파생한다 — 별도의 마크를 지어내지 않는다 (docs/DESIGN.md "앱 셸").
// 글자는 워드마크 하나뿐이다. 링크 미리보기의 설명 문구는 이미지가 아니라
// layout.tsx 의 openGraph.description 이 담당하므로 여기에 한글을 넣지 않는다
// (ImageResponse 는 WOFF2 를 못 읽어 Pretendard 를 그대로 실을 수 없다).
const SURFACE_PAGE = "#FFFFFF";
const HAIRLINE = "#E4E4E9";
const INK = "#1A1A24";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: SURFACE_PAGE,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          padding: "96px",
          width: "100%",
        }}
      >
        <div
          style={{
            color: INK,
            fontSize: 96,
            fontWeight: 500,
            letterSpacing: "-2px",
          }}
        >
          finsight
        </div>
        <div
          style={{
            background: HAIRLINE,
            height: 1,
            marginTop: 40,
            width: "100%",
          }}
        />
      </div>
    ),
    size,
  );
}
