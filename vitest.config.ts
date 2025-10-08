/** @jest-config-loader ts-node */
import { defineConfig } from "vitest/config";

const config = defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,js}"],
      exclude: [
        "src/index.ts",
        "src/register-commands.ts",
        "src/utils/visualHelpers.ts",
        "src/config.ts",
        "src/constants.ts",
      ],
    },
  },
});

export default config;
