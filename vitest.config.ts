import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["tests/{unit,component,integration}/**/*.test.{ts,tsx}"],
    environment: "node",
    globals: false,
    setupFiles: ["tests/helpers/setup.ts"],
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: { junit: "reports/vitest-junit.xml" },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "coverage",
      include: ["src/lib/**", "src/store/_pure.ts"],
      exclude: ["**/*.d.ts", "src/lib/print.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
