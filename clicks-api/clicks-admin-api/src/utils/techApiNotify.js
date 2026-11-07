/**
 * Internal admin-api → customer-tech-api call (shared-secret auth), for the
 * customer- and technician-facing side effects only the tech API can perform:
 * socket rooms, pushes. Sent through the outbox (scenario 68): tried once now
 * with a 5 s timeout, retried with backoff by this API's outbox worker. Never
 * throws, so an admin action never fails because the tech API was mid-deploy.
 *
 * @returns {Promise<boolean>} true when delivered on the first try
 */
const { sendToTechApi } = require("../../../clicks-shared/services/techApiNotify");

async function postToTechApi(path, body) {
  return sendToTechApi(path, body);
}

module.exports = { postToTechApi };
