import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";

import "./globals.css";

const pretendard = localFont({
  src: [
    {
      path: "./fonts/PretendardVariable.subset.woff2",
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

const SITE_DESCRIPTION =
  "카드 명세서 CSV를 올리면 지출을 자동 분류하고 행동을 바꿀 수 있는 지적을 찾아줍니다. 계좌를 연동하지 않습니다.";

// opengraph-image 의 절대 URL 기준점. 없으면 Next 가 VERCEL_URL 로 추론한다.
const siteUrl = process.env.NEXT_PUBLIC_APP_URL;

export const metadata: Metadata = {
  title: "finsight",
  description: SITE_DESCRIPTION,
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  openGraph: {
    description: SITE_DESCRIPTION,
    locale: "ko_KR",
    siteName: "finsight",
    title: "finsight",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    description: SITE_DESCRIPTION,
    title: "finsight",
  },
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
