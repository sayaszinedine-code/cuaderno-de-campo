import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Provider calls skip the consent check: only src/ai may reach them.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/ai/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/ai/generate", "@/ai/claude", "@/ai/deepseek"],
              message: "Use generateWithSettings from @/ai.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "out-e2e/**",
      ".next-e2e/**",
      "test-results/**",
      "playwright-report/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
