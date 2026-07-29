import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local preview talks to production Railway APIs via same-origin proxy
// so browser CORS (localhost → railway) is not required.
const ADMIN_API =
  process.env.VITE_DEV_ADMIN_PROXY ||
  "https://clicks-admin-api-production.up.railway.app";

/** Rewrite browser Origin to an allowed production frontend origin (remote proxies only). */
function rewriteOrigin(proxyReq) {
  const target = String(ADMIN_API || "");
  const isLocal =
    /localhost|127\.0\.0\.1/i.test(target) || target.startsWith("http://");
  if (isLocal) return;
  proxyReq.setHeader("origin", "https://admin.clicks.qa");
  proxyReq.setHeader("referer", "https://admin.clicks.qa/");
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 3001,
    proxy: {
      "/api": {
        target: ADMIN_API,
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          proxy.on("proxyReq", rewriteOrigin);
        },
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 3001,
  },
});
