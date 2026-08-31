import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "read-excel-file": new URL(
        "./node_modules/read-excel-file/browser/index.js",
        import.meta.url
      ).pathname,
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "supabase/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
