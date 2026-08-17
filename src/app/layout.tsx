import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";

import "./globals.css";

const pretendard = localFont({
  src: [
    {
      path: "./fonts/PretendardVariable.woff2",
      style: "normal",
      weight: "45 920",
    },
  ],
  display: "swap",
  variable: "--font-pretendard",
});

const themeInitializationScript = `
(function () {
  try {
    var storedTheme = window.localStorage.getItem("theme");
    var prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme =
      storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : prefersDark
          ? "dark"
          : "light";

    document.documentElement.dataset.theme = theme;
  } catch (error) {
    var fallbackPrefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    document.documentElement.dataset.theme = fallbackPrefersDark
      ? "dark"
      : "light";
  }
})();
`;

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
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeInitializationScript }}
        />
      </head>
      <body className={pretendard.variable}>{children}</body>
    </html>
  );
}
