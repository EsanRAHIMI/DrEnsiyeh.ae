import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      APP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      TOKEN_PEPPER: "test-pepper",
      BOOKING_TOKEN_SECRET: "test-booking-secret",
    },
  },
});
