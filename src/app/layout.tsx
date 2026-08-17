import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "finsight",
  description:
    "카드 명세서 CSV를 올리면 지출을 자동 분류하고 행동을 바꿀 수 있는 지적을 찾아줍니다.",
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
