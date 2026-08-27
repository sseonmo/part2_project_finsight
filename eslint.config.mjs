import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      // 워크트리는 자기 자리에서 자기 설정으로 검사한다. 여기서 훑으면 남의
      // node_modules 와 빌드 산출물까지 딸려 들어온다.
      ".claude/**",
      "out/**",
      "next-env.d.ts",
      "design/**",
      "docs/**",
      "phases/**",
      "scripts/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
