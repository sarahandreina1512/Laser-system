import { defineConfig } from "@playwright/test";

const env = { DATABASE_URL: "sqlite+aiosqlite:///./e2e.db", JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret-1" };
export default defineConfig({
  testDir: "./e2e", workers: 1, fullyParallel: false, retries: 0, timeout: 30_000,
  use: { baseURL: "http://localhost:5173", trace: "retain-on-failure" },
  webServer: [
    { command: "python -m scripts.seed_e2e && uvicorn app.main:app --port 8000", cwd: "../backend", env,
      url: "http://localhost:8000/docs", reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: "npm run dev -- --port 5173 --strictPort", url: "http://localhost:5173", reuseExistingServer: !process.env.CI },
  ],
});
