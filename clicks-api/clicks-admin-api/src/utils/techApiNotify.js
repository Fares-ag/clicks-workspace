/**
 * Internal admin-api → customer-tech-api call (shared-secret auth), for the
 * customer-facing side effects only the tech API can perform: socket rooms,
 * customer push. Best-effort: logs and resolves false on failure so an admin
 * action never fails because the tech API was mid-deploy.
 */
const axios = require("axios");

async function postToTechApi(path, body, { timeout = 5000 } = {}) {
  try {
    const base = process.env.CUSTOMER_TECH_API_URL || "http://localhost:5001";
    await axios.post(`${base}${path}`, body, {
      headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET },
      timeout,
    });
    return true;
  } catch (err) {
    console.error(`tech-api notify ${path} failed:`, err.message);
    return false;
  }
}

module.exports = { postToTechApi };
