import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/preview.tsx"],
      thresholds: {
        statements: 89,
        branches: 85,
        functions: 85,
        lines: 95,
      },
    },
  },
});
