const Notification = require("../../../clicks-shared/models/Notification");

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

module.exports = {
  recordAdminNotification,
  recordAdminNotificationFireAndForget,
};
