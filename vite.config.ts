import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const restartMode = process.env.COPICU_VITE_RESTART_MODE === "1";
const probeMode = process.env.COPICU_VITE_PROBE_MODE === "1";
const tauriDevMode = process.env.COPICU_TAURI_DEV === "1" || restartMode;

function devRequestTimingPlugin() {
  return {
    name: "copicu-dev-request-timing",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (!tauriDevMode) {
          return html;
        }
        return html.replace(
          /<script type="module" src="\/@vite\/client"><\/script>\s*/g,
          "",
        );
      },
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const startedAt = performance.now();
        const url = req.url ?? "";
        if (tauriDevMode) {
          delete req.headers["if-none-match"];
          delete req.headers["if-modified-since"];
          res.setHeader("Cache-Control", "no-store, max-age=0");
        }
        if (
          tauriDevMode ||
          url === "/" ||
          url.includes("/src/boot") ||
          url.includes("/src/main") ||
          url.includes("/src/dev-probes") ||
          url.includes("@vite/client") ||
          url.includes("@react-refresh")
        ) {
          console.error(`[vite:req] start ${req.method} ${url}`);
          const done = (event) => {
            const elapsed = Math.round(performance.now() - startedAt);
            console.error(`[vite:req] ${event} ${req.method} ${url} status=${res.statusCode} elapsed=${elapsed}ms`);
          };
          res.once("finish", () => done("finish"));
          res.once("close", () => done("close"));
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [devRequestTimingPlugin(), react()],
  clearScreen: false,
  optimizeDeps: {
    include: [
      "@mantine/core",
      "@mantine/hooks",
      "@tanstack/react-virtual",
      "@tauri-apps/api/core",
      "@tauri-apps/api/dpi",
      "@tauri-apps/api/event",
      "@tauri-apps/api/window",
      "lucide-react",
      "react",
      "react-dom",
      "react-dom/client",
      "react-markdown",
      "rehype-highlight",
      "remark-gfm",
    ],
    holdUntilCrawlEnd: false,
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    hmr: tauriDevMode ? false : undefined,
    warmup: tauriDevMode || probeMode
      ? undefined
      : {
          clientFiles: ["./src/main.tsx"],
        },
  },
});
