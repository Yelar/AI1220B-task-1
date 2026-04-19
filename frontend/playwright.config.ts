import path from "node:path";

import { defineConfig } from "@playwright/test";

const frontendDir = __dirname;
const backendDir = path.resolve(frontendDir, "..", "backend");

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010",
      cwd: backendDir,
      url: "http://127.0.0.1:8010/api/health",
      reuseExistingServer: false,
      env: {
        ...process.env,
        DATABASE_URL: "sqlite:///./data/e2e.db",
        FRONTEND_ORIGIN: "http://127.0.0.1:3100",
        LLM_MOCK: "true",
      },
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
      cwd: frontendDir,
      url: "http://127.0.0.1:3100/login",
      reuseExistingServer: false,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8010/api",
        NEXT_PUBLIC_WS_BASE_URL: "ws://127.0.0.1:8010/ws",
      },
    },
  ],
});
