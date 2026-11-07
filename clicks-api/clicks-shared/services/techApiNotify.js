/**
 * Admin API → customer/tech API internal calls (scenario 68).
 *
 * The admin API has no sockets and no customer push credentials, so every
 * customer- or technician-facing side effect of an admin action is an internal
 * POST to the tech API. Those calls used to be bare axios posts with no
 * timeout and no retry: a tech-API deploy silently dropped them. Each call is
 * now an outbox row, tried once right away (5 s timeout) and retried by the
 * admin API's outbox worker with backoff until it lands or is marked failed
 * (which alerts Sentry).
 */
const {
  OUTBOX_TYPES,
  enqueueOutboxEvent,
  runOutboxEventNow,
} = require("./outboxWorker");

/**
 * @param {string} path  tech-API path, e.g. "/api/sos/notify-technician"
 * @param {object} body
 * @returns {Promise<boolean>} true when delivered on the first try; false means
 *   it is queued for retry (never throws — an admin action must not fail
 *   because the tech API is mid-deploy).
 */
async function sendToTechApi(path, body = {}) {
  let event;
  try {
    event = await enqueueOutboxEvent(OUTBOX_TYPES.TECH_API_NOTIFY, { path, body });
  } catch (err) {
    console.error(`[tech-api-notify] enqueue ${path} failed:`, err.message);
    return false;
  }
  try {
    return await runOutboxEventNow(event._id);
  } catch (err) {
    console.error(`[tech-api-notify] ${path} first try failed:`, err.message);
    return false;
  }
}

module.exports = { sendToTechApi };
