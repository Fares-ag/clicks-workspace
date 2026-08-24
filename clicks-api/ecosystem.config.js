const path = require("path");

/**
 * VPS-generic PM2 config (Hetzner / DigitalOcean / Linode / any Linux host).
 *
 * CLICKS_API_ROOT — absolute path to this repo on the server (defaults to this file's directory).
 * TECH_API_INSTANCES — only raise above 1 when REDIS_URL is set on customer-tech-api
 *                      and nginx uses sticky sessions (ip_hash) for the tech API.
 */
const root = process.env.CLICKS_API_ROOT || __dirname;
const techInstances = Math.max(1, Number(process.env.TECH_API_INSTANCES || 1));

if (techInstances > 1 && !process.env.REDIS_URL) {
  console.warn(
    "[ecosystem] TECH_API_INSTANCES > 1 without REDIS_URL — Socket.IO fanout will break. Set REDIS_URL or keep instances=1."
  );
}

module.exports = {
  apps: [
    {
      name: "clicks-admin-api",
      script: "src/index.js",
      cwd: path.join(root, "clicks-admin-api"),
      env_file: ".env",
      // clicks-shared models resolve mongoose via NODE_PATH (sibling package layout).
      env: { NODE_PATH: path.join(root, "clicks-admin-api", "node_modules") },
      instances: 1,
      exec_mode: "fork",
    },
    {
      name: "clicks-customer-tech-api",
      script: "src/index.js",
      cwd: path.join(root, "clicks-customer-tech-api"),
      env_file: ".env",
      // clicks-shared models resolve mongoose via NODE_PATH (sibling package layout).
      env: { NODE_PATH: path.join(root, "clicks-customer-tech-api", "node_modules") },
      instances: techInstances,
      exec_mode: techInstances > 1 ? "cluster" : "fork",
    },
  ],
};
