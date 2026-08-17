"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "theme";

function getDocumentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(getDocumentTheme());
  }, []);

  function toggleTheme() {
    const nextTheme = getDocumentTheme() === "dark" ? "light" : "dark";

    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);
  }

  return (
    <button
      aria-label={
        theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"
      }
      className="theme-toggle"
      onClick={toggleTheme}
      type="button"
    >
      <span aria-hidden className="theme-toggle__dot" />
      <span className="theme-toggle__label">
        {theme === "dark" ? "다크 모드" : "라이트 모드"}
      </span>
    </button>
  );
}
