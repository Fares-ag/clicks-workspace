/** How long after "went to background" a socket drop is treated as expected (iOS). */
const BACKGROUND_DISCONNECT_GRACE_MS = Number(
  process.env.TECH_BACKGROUND_DISCONNECT_GRACE_MS || 5000
);

function parseLifecycleState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase();
  if (state === "background" || state === "foreground") return state;
  return null;
}

/**
 * Classify a technician socket disconnect for the activity log.
 *
 * Old app builds never send lifecycle events — keep the legacy "App closed"
 * row. New builds mark themselves capable on register; a drop while they
 * were still in the foreground is a force-quit or crash.
 *
 * @param {{
 *   supportsLifecycle: boolean,
 *   backgrounded: boolean,
 *   backgroundedAt?: number|null,
 *   now?: number,
 *   reason?: string,
 * }} params
 * @returns {"legacy_closed"|"skip"|"force_closed"|"closed_in_background"}
 */
function classifyTechnicianDisconnect({
  supportsLifecycle,
  backgrounded,
  backgroundedAt = null,
  now = Date.now(),
  reason = "",
} = {}) {
  if (!supportsLifecycle) return "legacy_closed";

  const why = String(reason || "");
  if (why === "io client disconnect") return "legacy_closed";

  if (backgrounded) {
    const age =
      backgroundedAt == null ? Infinity : now - Number(backgroundedAt);
    if (Number.isFinite(age) && age < BACKGROUND_DISCONNECT_GRACE_MS) {
      return "skip";
    }
    return "closed_in_background";
  }

  return "force_closed";
}

function disconnectActivityForDecision(decision, reason) {
  if (decision === "skip") return null;
  if (decision === "force_closed") {
    return {
      event: "session.app_force_closed",
      message:
        "Force closed or crashed (socket dropped while in the foreground)",
      metadata: { reason: String(reason || "") },
    };
  }
  if (decision === "closed_in_background") {
    return {
      event: "session.app_closed_in_background",
      message: "Socket dropped while the app was in the background",
      metadata: { reason: String(reason || "") },
    };
  }
  return {
    event: "session.app_closed",
    message: "App went to background or lost connection",
    metadata: { reason: String(reason || "") },
  };
}

/**
 * Persist + log an explicit app lifecycle transition from socket or REST.
 *
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, state?: string }>}
 */
async function applyTechnicianAppLifecycle({
  Technician,
  technicianId,
  state,
  recordTechnicianActivity,
}) {
  const parsed = parseLifecycleState(state);
  if (!parsed) return { ok: false, reason: "invalid_state" };

  const id = String(technicianId);
  const existing = await Technician.findById(id)
    .select("lastAppLifecycle lastAppLifecycleAt")
    .lean();

  if (existing?.lastAppLifecycle === parsed) {
    return { ok: true, skipped: true, state: parsed };
  }

  const now = new Date();
  await Technician.updateOne(
    { _id: id },
    {
      appLifecycleCapable: true,
      lastAppLifecycle: parsed,
      lastAppLifecycleAt: now,
    }
  );

  if (typeof recordTechnicianActivity === "function") {
    recordTechnicianActivity({
      technicianId: id,
      event:
        parsed === "background"
          ? "session.app_backgrounded"
          : "session.app_foregrounded",
      message:
        parsed === "background"
          ? "App went to background"
          : "Returned to the app",
    });
  }

  return { ok: true, state: parsed };
}

async function recordTechnicianDisconnectActivity({
  Technician,
  technicianId,
  reason,
  socketId,
  recordTechnicianActivity,
}) {
  if (typeof recordTechnicianActivity !== "function") return;

  const tech = await Technician.findById(technicianId)
    .select("appLifecycleCapable lastAppLifecycle lastAppLifecycleAt")
    .lean();

  const decision = classifyTechnicianDisconnect({
    supportsLifecycle: tech?.appLifecycleCapable === true,
    backgrounded: tech?.lastAppLifecycle === "background",
    backgroundedAt: tech?.lastAppLifecycleAt
      ? new Date(tech.lastAppLifecycleAt).getTime()
      : null,
    now: Date.now(),
    reason,
  });

  const activity = disconnectActivityForDecision(decision, reason);
  if (!activity) return;

  recordTechnicianActivity({
    technicianId,
    event: activity.event,
    message: activity.message,
    metadata: { ...activity.metadata, socket_id: socketId },
  });
}

module.exports = {
  BACKGROUND_DISCONNECT_GRACE_MS,
  parseLifecycleState,
  classifyTechnicianDisconnect,
  disconnectActivityForDecision,
  applyTechnicianAppLifecycle,
  recordTechnicianDisconnectActivity,
};
