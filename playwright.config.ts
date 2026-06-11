import { defineConfig, devices } from "@playwright/test";

const visualPort = Number(process.env.COPICU_VISUAL_PORT ?? "1421");
const visualHost = `http://127.0.0.1:${visualPort}`;

export default defineConfig({
  testDir: "./tests/visual",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: visualHost,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:VITE_COPICU_VISUAL_TEST='1'; $env:VITE_COPICU_RENDERER_DIAGNOSTICS='debug'; npm run build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; npx vite preview --host 127.0.0.1 --port ${visualPort} --strictPort"`,
    url: visualHost,
    reuseExistingServer: false,
    timeout: 90_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 900, height: 620 },
      },
    },
    {
      name: "chromium-narrow-window",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 420, height: 620 },
      },
    },
  ],
});
