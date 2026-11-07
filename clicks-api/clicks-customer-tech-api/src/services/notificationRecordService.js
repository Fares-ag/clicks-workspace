const Notification = require("../../../clicks-shared/models/Notification");

const CUSTOMER_EVENT_TYPES = {
  technicianAssigned: "technician_assigned",
  technicianAccepted: "technician_accepted",
  technicianEnRoute: "en_route",
  technicianArrived: "arrived",
  jobStarted: "in_progress",
  jobCompleted: "job_completed",
  jobCancelled: "job_cancelled",
  paymentConfirmed: "payment_received",
  sosInCall: "sos_update",
};

function customerTypeForEvent(event) {
  return CUSTOMER_EVENT_TYPES[event] || String(event || "update");
}

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

function recordCustomerNotificationFireAndForget(payload) {
  recordCustomerNotification(payload).catch((err) => {
    console.error("[notification] failed to record customer notification:", err.message);
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
    data: row.data || {},
  };
}

module.exports = {
  CUSTOMER_EVENT_TYPES,
  customerTypeForEvent,
  recordAdminNotification,
  recordAdminNotificationFireAndForget,
  recordCustomerNotification,
  recordCustomerNotificationFireAndForget,
  serializeCustomerNotification,
};
