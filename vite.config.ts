import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const restartMode = process.env.COPICU_VITE_RESTART_MODE === "1";
const probeMode = process.env.COPICU_VITE_PROBE_MODE === "1";

function devRequestTimingPlugin() {
  return {
    name: "copicu-dev-request-timing",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        if (!restartMode) {
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
        if (restartMode) {
          delete req.headers["if-none-match"];
          delete req.headers["if-modified-since"];
          res.setHeader("Cache-Control", "no-store, max-age=0");
        }
        if (
          restartMode ||
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
  plugins: [devRequestTimingPlugin(), ...(restartMode ? [] : react())],
  clearScreen: false,
  optimizeDeps: restartMode
    ? {
        include: [
          "@mantine/core",
          "@mantine/hooks",
          "@tanstack/react-virtual",
          "@tauri-apps/api/core",
          "@tauri-apps/api/dpi",
          "@tauri-apps/api/event",
          "@tauri-apps/api/window",
          "react",
          "react-dom",
          "react-dom/client",
          "react/jsx-dev-runtime",
          "react/jsx-runtime",
        ],
        noDiscovery: true,
        holdUntilCrawlEnd: false,
      }
    : {
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
    hmr: restartMode ? false : undefined,
    warmup: restartMode || probeMode
      ? undefined
      : {
          clientFiles: ["./src/main.tsx"],
        },
  },
});
