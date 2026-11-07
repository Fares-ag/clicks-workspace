const Notification = require("../../../clicks-shared/models/Notification");

const {
  CUSTOMER_EVENTS,
  customerTypeForEvent,
} = require("../../../clicks-shared/constants/customerEvents");

/** event name → inbox `type` (from the shared catalog). */
const CUSTOMER_EVENT_TYPES = Object.fromEntries(
  Object.entries(CUSTOMER_EVENTS).map(([event, spec]) => [event, spec.type])
);

/**
 * Persist an admin-broadcast notification. Best-effort — never throws to callers.
 */
async function recordAdminNotification({ type, title, body, data }) {
  if (!type || !title) return;
  await Notification.create({
    audience: "admin",
    type,
    title,
    body: body || "",
    data: data || {},
    read_by: [],
  });
}

function recordAdminNotificationFireAndForget(payload) {
  recordAdminNotification(payload).catch((err) => {
    console.error("[notification] failed to record admin notification:", err.message);
  });
}

/**
 * Low-level inbox write. Customer-facing transitions must go through
 * clicks-shared/services/notifyCustomer (inbox → socket → push) instead.
 */
async function recordCustomerNotification({
  customerId,
  type,
  title,
  body,
  data,
}) {
  if (!customerId || !title) return null;
  return Notification.create({
    audience: "customer",
    customer_id: customerId,
    type: type || "update",
    title,
    body: body || "",
    data: data || {},
    read: false,
    read_by: [],
  });
}

function serializeCustomerNotification(doc) {
  const row = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    _id: row._id,
    id: row._id,
    customer_id: row.customer_id,
    title: row.title,
    body: row.body,
    message: row.body,
    type: row.type,
    read: Boolean(row.read),
    createdAt: row.createdAt,
    event: row.event || row.data?.event || null,
    job_id: row.data?.job_id || null,
    sos_id: row.data?.sos_id || null,
    data: row.data || {},
  };
}

module.exports = {
  CUSTOMER_EVENT_TYPES,
  customerTypeForEvent,
  recordAdminNotification,
  recordAdminNotificationFireAndForget,
  recordCustomerNotification,
  serializeCustomerNotification,
};
