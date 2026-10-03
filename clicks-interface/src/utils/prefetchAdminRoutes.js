/** Start downloading the pages admins open first. Keep this out of Login.jsx
 * so Vite does not modulepreload LiveMap / Google Maps on the login HTML. */
export function prefetchAdminRouteChunks() {
  import("../pages/JobManagement/Jobs.jsx");
}

export function prefetchAdminRouteChunksWhenIdle() {
  const run = prefetchAdminRouteChunks;
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 2000 });
    return;
  }
  setTimeout(run, 300);
}
