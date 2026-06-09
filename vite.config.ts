import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
      "react-dom/client",
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
});
