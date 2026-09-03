import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Local-first defaults. Override with VITE_DEV_ADMIN_PROXY / VITE_DEV_TECH_PROXY
// (e.g. Railway) when you intentionally want a remote stack.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const ADMIN_API =
    env.VITE_DEV_ADMIN_PROXY ||
    process.env.VITE_DEV_ADMIN_PROXY ||
    "http://127.0.0.1:5000";
  const TECH_API =
    env.VITE_DEV_TECH_PROXY ||
    process.env.VITE_DEV_TECH_PROXY ||
    "http://127.0.0.1:5001";

  /** Rewrite browser Origin only when proxying to a remote (non-local) API. */
  function rewriteOrigin(proxyReq) {
    const target = String(ADMIN_API || "");
    const isLocal =
      /localhost|127\.0\.0\.1/i.test(target) || target.startsWith("http://");
    if (isLocal) return;
    proxyReq.setHeader("origin", "https://admin.clicks.qa");
    proxyReq.setHeader("referer", "https://admin.clicks.qa/");
  }

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            recharts: ["recharts"],
            googlemaps: ["@react-google-maps/api"],
            xlsx: ["xlsx"],
            antd: ["antd"],
          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      proxy: {
        "/api": {
          target: ADMIN_API,
          changeOrigin: true,
          secure: true,
          configure: (proxy) => {
            proxy.on("proxyReq", rewriteOrigin);
          },
        },
        "/socket.io": {
          target: TECH_API,
          changeOrigin: true,
          secure: true,
          ws: true,
          configure: (proxy) => {
            proxy.on("proxyReq", rewriteOrigin);
          },
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 3000,
    },
  };
});
