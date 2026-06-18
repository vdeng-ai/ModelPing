import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// 前端构建到 dist/client，后端(Node serveStatic / CF assets)从这里取静态资源。
// dev 模式下 /api 代理到本地 Hono(8787)。
export default defineConfig({
  root: "web",
  plugins: [preact()],
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
