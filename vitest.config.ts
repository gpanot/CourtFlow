import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/modules/courtpay/**/*.ts",
        "src/app/api/courtpay/**/*.ts",
        "src/app/api/webhooks/sepay/route.ts",
        "src/lib/billing.ts",
        "src/app/api/admin/billing/**/*.ts",
        "src/app/api/staff/boss-dashboard/billing/**/*.ts",
        "src/app/api/cron/generate-invoices/route.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
