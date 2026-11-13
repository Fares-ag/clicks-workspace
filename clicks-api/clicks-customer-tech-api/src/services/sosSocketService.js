const jwt = require("jsonwebtoken");
const {
  Admin,
  SOSRequest,
  ServiceRequest,
  Technician,
  Job,
  Customer,
  CustomerVehicle,
} = require("../../../clicks-shared/models");
const { broadcastMs, inCallTimeoutMs } = require("../utils/sosTimeout");
const { setTechnicianStatus } = require("../../../clicks-shared/services/technicianOnlineHours");
const {
  assertJobAccess,
  assertSosAccess,
  assertVehicleOwner,
  sameId,
} = require("../utils/ownership");
const { parseJobLocation } = require("../../../clicks-shared/utils/parseJobLocation");
const { distanceBetween } = require("../../../clicks-shared/utils/geoDistance");
const {
  applyTechnicianLocationWrite,
  parseCoordinatePair,
} = require("../../../clicks-shared/utils/technicianLocationWrite");
const { captureException } = require("../../../clicks-shared/middleware/sentry");
const {
  recordTechnicianActivity,
} = require("../../../clicks-shared/services/technicianActivityLog");
const { durationEnv } = require("../../../clicks-shared/utils/durationEnv");
const {
  applyTechnicianAppLifecycle,
  recordTechnicianDisconnectActivity,
} = require("../../../clicks-shared/utils/technicianAppLifecycle");
const { sendAdminDispatchPush } = require("./fcmService");
const {
  recordAdminNotificationFireAndForget,
} = require("./notificationRecordService");
const {
  notifyCustomer,
  setCustomerNotifyTransport,
} = require("../../../clicks-shared/services/notifyCustomer");

const isDev = process.env.NODE_ENV === "development";
function devLog(...args) {
  if (isDev) console.log(...args);
}

function socketTechnicianUser(socket) {
  if (!socket?.user?.id) return null;
  return { id: socket.user.id, role: "technician" };
}

function assertSocketJobAccess(job, socket) {
  const user = socketTechnicianUser(socket);
  if (!user) return false;
  return assertJobAccess(job, user);
}

/**
 * Admin JWT roles are exactly the Admin model's role enum. The business, finance
 * and partner portals mint tokens with the SAME JWT_SECRET, so the /admin
 * namespace must match against this allow-list only — never fall through to
 * "any role that isn't customer/technician".
 */
const ADMIN_ROLES = new Set([
  "Super Admin",
  "Admin",
  "Job Dispatcher",
  "Coordinator",
  "Call Center Agent",
]);

function isAllowedAdminRole(role) {
  if (role == null) return false;
  return ADMIN_ROLES.has(String(role));
}

function attachNamespaceAuth(namespace, expectedRole) {
  namespace.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Unauthorized"));
    if (!process.env.JWT_SECRET) return next(new Error("Unauthorized"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (expectedRole === "admin") {
        // `decoded.id` must be present: mongoose strips undefined filter values,
        // so Admin.exists({_id: undefined, ...}) would match the first active admin.
        if (!decoded.id || !isAllowedAdminRole(decoded.role)) {
          return next(new Error("Unauthorized"));
        }
        // The role claim alone is forgeable across portals that share JWT_SECRET —
        // confirm the subject really is an active Admin document.
        const isAdmin = await Admin.exists({ _id: decoded.id, isActive: true });
        if (!isAdmin) return next(new Error("Unauthorized"));
      } else if (decoded.role !== expectedRole) {
        return next(new Error("Unauthorized"));
      } else if (expectedRole === "customer") {
        // Same checks as REST `authenticate` (scenario 14): a blocked or
        // deleted customer, or a token revoked by a password reset, must not
        // keep a live socket. The distinct message lets the app stop
        // retrying and show "contact support" instead of reconnecting forever.
        if (!decoded.id) return next(new Error("Unauthorized"));
        const customer = await Customer.findById(decoded.id).select(
          "status deleted_at token_version"
        );
        if (!customer || customer.deleted_at || customer.status !== "Active") {
          return next(new Error("ACCOUNT_INACTIVE"));
        }
        const tv = Number.isFinite(Number(decoded.tv)) ? Number(decoded.tv) : 0;
        const current = Number.isFinite(Number(customer.token_version))
          ? Number(customer.token_version)
          : 0;
        if (tv !== current) return next(new Error("TOKEN_REVOKED"));
      } else if (expectedRole === "technician") {
        // Mirror requireApprovedTechnician, which guards the REST location
        // endpoint. Without this a rejected, pending or deactivated technician
        // was 403'd on PATCH /location but could still open this socket, write
        // currentLocation, and paint a live marker on the admin map — and the
        // isActive:true filter in the sweeps meant nothing reconciled them off.
        if (!decoded.id) return next(new Error("Unauthorized"));
        const technician = await Technician.findById(decoded.id).select(
          "applicationStatus isActive"
        );
        if (
          !technician ||
          technician.isActive === false ||
          technician.applicationStatus !== "Approved"
        ) {
          return next(new Error("Unauthorized"));
        }
      }
      socket.user = decoded;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {Number} lat1 
 * @param {Number} lon1 
 * @param {Number} lat2 
 * @param {Number} lon2 
 * @returns {Number} Distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Initialize Socket.IO for SOS functionality
 * @param {Server} io - Socket.IO server instance
 */
const DEFAULT_LOCATION_STALE_MS = durationEnv("TECH_LOCATION_STALE_MS", 60000);

function locationAgeMs(lastLocationAt) {
  if (!lastLocationAt) return Infinity;
  return Date.now() - new Date(lastLocationAt).getTime();
}

function isLocationStale(lastLocationAt, staleMs = DEFAULT_LOCATION_STALE_MS) {
  return locationAgeMs(lastLocationAt) >= staleMs;
}

/** App-alive signal. Falls back to GPS time for technicians who predate lastHeartbeatAt. */
function isPresenceStale(technician, staleMs = DEFAULT_LOCATION_STALE_MS) {
  return locationAgeMs(technician?.lastHeartbeatAt || technician?.lastLocationAt) >=
    staleMs;
}

function presenceStaleMongoFilter(cutoff) {
  return {
    $or: [
      { lastHeartbeatAt: { $lt: cutoff } },
      { lastHeartbeatAt: null, lastLocationAt: { $lt: cutoff } },
      { lastHeartbeatAt: null, lastLocationAt: null },
    ],
  };
}

function coordsFromTechnician(technician) {
  const [longitude = 0, latitude = 0] =
    technician?.currentLocation?.coordinates || [0, 0];
  return { latitude, longitude };
}

function buildAdminTechnicianPayload(technician) {
  const { latitude, longitude } = coordsFromTechnician(technician);
  const v = technician.assignedVehicle;
  const lastLocationAt = technician.lastLocationAt
    ? new Date(technician.lastLocationAt).toISOString()
    : null;
  const lastHeartbeatAt = technician.lastHeartbeatAt
    ? new Date(technician.lastHeartbeatAt).toISOString()
    : null;
  return {
    technician_id: technician._id.toString(),
    firstName: technician.firstName,
    lastName: technician.lastName,
    phone: technician.phone,
    profilePicture: technician.profilePicture,
    currentStatus: technician.currentStatus,
    location: { latitude, longitude },
    lastLocationAt,
    lastHeartbeatAt,
    locationStale: isLocationStale(technician.lastLocationAt),
    presenceStale: isPresenceStale(technician),
    vehicle: v
      ? {
          _id: v._id,
          make: v.make?.makeName || v.make || "",
          model: v.model?.modelName || v.model || "",
          plateNumber: v.plateNumber,
        }
      : null,
  };
}

function initializeSOSSocket(io) {
  // Customer namespace
  const customerNamespace = io.of("/customer");
  // Technician namespace
  const technicianNamespace = io.of("/technician");
  // Admin namespace
  const adminNamespace = io.of("/admin");

  attachNamespaceAuth(customerNamespace, "customer");
  attachNamespaceAuth(technicianNamespace, "technician");
  attachNamespaceAuth(adminNamespace, "admin");

  /** Per-user Socket.IO rooms (`user:${jwtUserId}`) — Redis-adapter safe across instances. */
  /** Grace timers so brief reconnects don't yank Offline on Live Map */
  const technicianOfflineTimers = new Map(); // technician_id -> timeout
  /** Dedup On Job stale broadcasts (cleared on fresh location) */
  const staleLocationEmittedFor = new Set();

  function userRoom(userId) {
    return `user:${String(userId)}`;
  }

  async function userHasLiveSockets(namespace, userId) {
    try {
      const sockets = await namespace.in(userRoom(userId)).fetchSockets();
      return sockets.length > 0;
    } catch (err) {
      console.error("fetchSockets failed:", err.message);
      captureException(err);
      return false;
    }
  }

  function emitToUser(namespace, userId, event, payload) {
    namespace.to(userRoom(userId)).emit(event, payload);
  }

  // Every customer-facing transition goes through clicks-shared notifyCustomer
  // (inbox -> this socket room -> push). This process owns the socket server
  // and the customer FCM app, so it is the local delivery transport.
  setCustomerNotifyTransport({
    emit: (customerId, event, payload) =>
      emitToUser(customerNamespace, String(customerId), event, payload),
    push: (customerId, push) =>
      require("./fcmService").sendCustomerPush(String(customerId), push),
  });

  const pendingExpireTimers = new Map(); // sosId -> timeout
  const inCallExpireTimers = new Map(); // sosId -> timeout
  const DISCONNECT_OFFLINE_MS = Number(process.env.TECH_DISCONNECT_OFFLINE_MS || 30000);
  // How long without a location heartbeat before we consider the tech truly gone (force-quit).
  const LOCATION_STALE_MS = durationEnv("TECH_LOCATION_STALE_MS", 60000);

  function clearSosTimers(sosId) {
    const key = String(sosId);
    if (pendingExpireTimers.has(key)) {
      clearTimeout(pendingExpireTimers.get(key));
      pendingExpireTimers.delete(key);
    }
    if (inCallExpireTimers.has(key)) {
      clearTimeout(inCallExpireTimers.get(key));
      inCallExpireTimers.delete(key);
    }
  }

  async function markSosExpired(sos, message) {
    // Kept for explicit cancel/admin tools — auto-expiry is disabled.
    // SOS stays pending/in_call until claimed, cancelled, or converted to a job.
    if (!sos || !["pending", "in_call"].includes(sos.status)) return false;
    if (sos.status === "in_call" && sos.job_id) return false;

    sos.status = "expired";
    if (message) sos.cancel_reason = message;
    await sos.save();
    clearSosTimers(sos._id);

    const customerId = String(sos.customer_id);
    const payload = {
      sos_id: sos._id.toString(),
      message:
        message ||
        "No dispatcher accepted your SOS request in time. Please try again or call support.",
    };
    await notifyCustomer(customerId, "sosExpired", payload);
    adminNamespace.emit("sosExpired", payload);
    recordAdminNotificationFireAndForget({
      type: "sos.expired",
      title: "SOS expired",
      body: payload.message || "An SOS request expired.",
      data: { sos_id: payload.sos_id },
    });
    return true;
  }

  function schedulePendingExpiry(_sos) {
    // No-op: customer sees a 60s "we'll contact you" promise timer in the app,
    // but the SOS request itself never auto-expires.
  }

  function scheduleInCallExpiry(_sos) {
    // No-op: in_call SOS also stays until job creation or customer cancel.
  }

  async function sweepStaleSos() {
    // Auto-expiry disabled — nothing to sweep for pending/in_call timeouts.
  }

  // Boot / periodic hook retained (no-op) for compatibility
  sweepStaleSos();
  setInterval(sweepStaleSos, 60 * 1000).unref?.();

  // On Job force-quit: emit stale (not Offline) when heartbeat exceeds window.
  // A live technician socket means the process is still up even if GPS and the
  // Dart 12s timer have gone quiet in the background — refresh presence so
  // dispatch does not show Disconnected for an app sitting in Recents.
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - LOCATION_STALE_MS);
      const staleOnJob = await Technician.find({
        currentStatus: "On Job",
        isActive: true,
        ...presenceStaleMongoFilter(cutoff),
      }).select("_id lastLocationAt lastHeartbeatAt currentLocation");
      for (const t of staleOnJob) {
        const id = t._id.toString();
        if (await userHasLiveSockets(technicianNamespace, id)) {
          await refreshPresenceFromLiveSocket(t);
          continue;
        }
        if (!staleLocationEmittedFor.has(id)) {
          emitAdminTechnicianLocationStale(id, t.lastLocationAt);
        }
      }
    } catch (err) {
      console.error("On Job stale location sweep failed:", err);
      captureException(err);
    }
  }, 30000).unref?.();

  // Durable offline reconciliation. The disconnect grace timers live only in this
  // process, so a restart/redeploy loses them and strands the technician at
  // "Online" forever (dispatchable, and still accruing online hours). Re-derive
  // presence from the DB: Online + no live socket anywhere + no heartbeat.
  // "On Job" is deliberately excluded — that flow surfaces a stale location
  // instead of flipping the technician Offline mid-job.
  const OFFLINE_SWEEP_MS = durationEnv("TECH_OFFLINE_SWEEP_MS", 60000);

  /**
   * Auto-Offline: the technician did not choose this, we inferred it from a
   * missing socket or a stale heartbeat. Stamp autoOfflineAt so a later
   * reconnect can undo it.
   */
  async function markTechnicianAutoOffline(technicianOrId) {
    const tech = await setTechnicianStatus(technicianOrId, "Offline");
    if (!tech) return null;
    await Technician.updateOne({ _id: tech._id }, { autoOfflineAt: new Date() });
    return tech;
  }

  /**
   * A technician whose socket comes back after we auto-Offlined them was never
   * really off shift — a tunnel or a backgrounded app is not a shift change.
   * Without this they stay Offline and undispatchable until they happen to
   * notice and toggle manually, which is invisible to both them and dispatch.
   */
  async function restoreAutoOfflinedTechnician(technicianId) {
    try {
      const tech = await Technician.findById(technicianId).select(
        "currentStatus autoOfflineAt"
      );
      if (!tech || !tech.autoOfflineAt) return;

      if (tech.currentStatus !== "Offline") {
        // Something already moved them on (e.g. a job assignment) — just clear.
        await Technician.updateOne({ _id: technicianId }, { autoOfflineAt: null });
        return;
      }

      await setTechnicianStatus(technicianId, "Online");
      // The reconnecting socket is the app-alive signal: stamp it before
      // announcing them, or the Live Map is told they are back AND stale.
      await Technician.updateOne(
        { _id: technicianId },
        { autoOfflineAt: null, lastHeartbeatAt: new Date() }
      );
      await emitAdminTechnicianPresence(technicianId, "Online");
      devLog(`Technician ${technicianId} restored to Online after reconnect`);
    } catch (err) {
      console.error("Failed to restore auto-offlined technician:", err);
      captureException(err);
    }
  }

  async function sweepGhostOnlineTechnicians() {
    try {
      const cutoff = new Date(Date.now() - LOCATION_STALE_MS);
      const ghosts = await Technician.find({
        currentStatus: "Online",
        isActive: true,
        ...presenceStaleMongoFilter(cutoff),
      });
      for (const tech of ghosts) {
        const technicianId = tech._id.toString();
        // A disconnect timer in this process is already on the case.
        if (technicianOfflineTimers.has(technicianId)) continue;
        if (await userHasLiveSockets(technicianNamespace, technicianId)) {
          await refreshPresenceFromLiveSocket(tech);
          continue;
        }
        await markTechnicianAutoOffline(tech);
        await emitAdminTechnicianPresence(technicianId, "Offline");
        devLog(`Technician ${technicianId} marked Offline by reconciliation sweep`);
      }
    } catch (err) {
      console.error("Ghost Online technician sweep failed:", err);
      captureException(err);
    }
  }

  setInterval(sweepGhostOnlineTechnicians, OFFLINE_SWEEP_MS).unref?.();

  // Keep presence fresh for every technician whose app still holds a socket.
  //
  // The two sweeps above also do this, but only for technicians ALREADY past
  // the stale window, and they run on that same period: a technician refreshed
  // by one pass is a few milliseconds short of the cutoff on the next, so the
  // rescue lands every second pass and the heartbeat age swings 0..2x the
  // window. The Live Map then shows a connected technician as disconnected
  // about half the time. This pass refreshes at half the window, on a shorter
  // period, so a connected app never reaches the threshold at all.
  //
  // It only ever refreshes. It never marks anyone stale or Offline — those
  // decisions stay with the sweeps above, on their existing timing.
  const PRESENCE_REFRESH_SWEEP_MS = durationEnv("TECH_PRESENCE_REFRESH_SWEEP_MS", 20000);

  async function refreshPresenceForConnectedTechnicians() {
    // Nothing to do (and nothing worth alerting on) while the database is down.
    if (Technician.db?.readyState !== 1) return;
    try {
      const cutoff = new Date(Date.now() - Math.floor(LOCATION_STALE_MS / 2));
      const quiet = await Technician.find({
        currentStatus: { $in: ["Online", "On Job"] },
        isActive: true,
        ...presenceStaleMongoFilter(cutoff),
      }).select("_id lastLocationAt lastHeartbeatAt currentLocation");
      for (const tech of quiet) {
        if (await userHasLiveSockets(technicianNamespace, tech._id.toString())) {
          await refreshPresenceFromLiveSocket(tech);
        }
      }
    } catch (err) {
      console.error("Connected technician presence refresh failed:", err);
      captureException(err);
    }
  }

  setInterval(refreshPresenceForConnectedTechnicians, PRESENCE_REFRESH_SWEEP_MS).unref?.();

  function emitAdminTechnicianLocationStale(technician_id, lastLocationAt) {
    const id = technician_id.toString();
    staleLocationEmittedFor.add(id);
    liveMap().emit("technicianLocationStale", {
      technician_id: id,
      lastLocationAt: lastLocationAt
        ? new Date(lastLocationAt).toISOString()
        : null,
      locationStale: true,
      presenceStale: true,
    });
  }

  const ADMIN_MAP_BATCH_MS = durationEnv("ADMIN_MAP_BATCH_MS", 2000);
  // Every fix used to go out twice — once immediately as technicianLocationUpdate
  // and again inside the ≤2s batch — so the admin client applied and re-rendered
  // each move twice, and an out-of-order pair could rubber-band a marker
  // backwards. The Live Map consumes technicianLocationBatch, so the duplicate
  // is now off by default; set ADMIN_MAP_LEGACY_EVENTS=true to roll back.
  const ADMIN_MAP_LEGACY_EVENTS =
    String(process.env.ADMIN_MAP_LEGACY_EVENTS ?? "false") === "true";
  /**
   * Admins watching the Live Map.
   *
   * Location and presence were broadcast namespace-wide, so every admin session
   * received the entire fleet's coordinates, phone numbers and vehicle plates on
   * every page — including the second notification socket that has no location
   * handlers at all. Only sockets that explicitly join get the feed now.
   */
  const LIVE_MAP_ROOM = "live-map";
  // Deploy escape hatch: an admin bundle from before joinLiveMap existed never
  // joins the room, so scoping the feed would leave its map blank. Set
  // LIVE_MAP_ROOM_SCOPED=false to fan out namespace-wide until the web client
  // has rolled out, then remove the override.
  const LIVE_MAP_ROOM_SCOPED =
    String(process.env.LIVE_MAP_ROOM_SCOPED ?? "true") === "true";
  const liveMap = () =>
    LIVE_MAP_ROOM_SCOPED ? adminNamespace.to(LIVE_MAP_ROOM) : adminNamespace;

  const adminLocationBatch = new Map();
  /**
   * Technicians we have already broadcast as Offline.
   *
   * A location fix arriving after that must not be fanned out to the admin map:
   * the batch flush lands up to ADMIN_MAP_BATCH_MS later, so an Offline event
   * was routinely followed by a trailing location for the same technician,
   * which the Live Map rendered as a resurrected marker.
   */
  const offlineTechnicians = new Set();

  function flushAdminLocationBatch() {
    if (adminLocationBatch.size === 0) return;
    const updates = [...adminLocationBatch.values()];
    adminLocationBatch.clear();
    liveMap().emit("technicianLocationBatch", {
      updates,
      ts: new Date().toISOString(),
    });
  }

  const adminLocationBatchTimer = setInterval(flushAdminLocationBatch, ADMIN_MAP_BATCH_MS);
  adminLocationBatchTimer.unref?.();

  /**
   * Socket still connected, GPS/heartbeat writes have gone quiet. Stamp
   * lastHeartbeatAt only — lastLocationAt stays the real GPS measurement time.
   */
  async function refreshPresenceFromLiveSocket(technician) {
    const id = technician._id.toString();
    const lastHeartbeatAt = new Date();
    await Technician.updateOne({ _id: id }, { lastHeartbeatAt });
    technician.lastHeartbeatAt = lastHeartbeatAt;
    const { latitude, longitude } = coordsFromTechnician(technician);
    if (latitude === 0 && longitude === 0) return;
    emitAdminTechnicianLocation(
      id,
      latitude,
      longitude,
      technician.lastLocationAt,
      lastHeartbeatAt
    );
  }

  function emitAdminTechnicianLocation(
    technician_id,
    latitude,
    longitude,
    lastLocationAt,
    lastHeartbeatAt
  ) {
    const id = technician_id.toString();
    if (offlineTechnicians.has(id)) return;
    staleLocationEmittedFor.delete(id);
    const heardIso = lastHeartbeatAt
      ? new Date(lastHeartbeatAt).toISOString()
      : new Date().toISOString();
    const gpsIso = lastLocationAt
      ? new Date(lastLocationAt).toISOString()
      : heardIso;
    const gpsStale = isLocationStale(gpsIso);

    adminLocationBatch.set(id, {
      technician_id: id,
      latitude,
      longitude,
      updatedAt: heardIso,
      lastLocationAt: gpsIso,
      lastHeartbeatAt: heardIso,
      locationStale: gpsStale,
      presenceStale: false,
    });

    if (ADMIN_MAP_LEGACY_EVENTS) {
      liveMap().emit("technicianLocationUpdate", {
        technician_id: id,
        latitude,
        longitude,
        updatedAt: heardIso,
        lastLocationAt: gpsIso,
        lastHeartbeatAt: heardIso,
        locationStale: gpsStale,
        presenceStale: false,
      });
    }
  }

  /** On Job techs stay on the map but surface stale when heartbeat stops. */
  function scheduleOnJobStaleCheck(technicianId, locationAge) {
    const checkAndEmit = async () => {
      if (await userHasLiveSockets(technicianNamespace, technicianId)) return;
      try {
        const t = await Technician.findById(technicianId).select(
          "currentStatus lastLocationAt lastHeartbeatAt"
        );
        if (!t || t.currentStatus !== "On Job") return;
        if (isPresenceStale(t, LOCATION_STALE_MS)) {
          emitAdminTechnicianLocationStale(technicianId, t.lastLocationAt);
        }
      } catch (err) {
        console.error("On Job stale check failed:", err);
        captureException(err);
      }
    };

    if (locationAge >= LOCATION_STALE_MS) {
      checkAndEmit();
      return;
    }

    const delay = Math.max(0, LOCATION_STALE_MS - locationAge);
    const followUp = setTimeout(async () => {
      technicianOfflineTimers.delete(technicianId);
      await checkAndEmit();
    }, delay);
    followUp.unref?.();
    technicianOfflineTimers.set(technicianId, followUp);
  }

  async function emitAdminTechnicianPresence(technicianId, status) {
    try {
      if (status === "Offline") {
        const id = technicianId.toString();
        // Drop any pending batch entry before announcing the departure,
        // otherwise the next flush re-adds them to the map.
        adminLocationBatch.delete(id);
        offlineTechnicians.add(id);
        liveMap().emit("technicianOffline", { technician_id: id });
        return;
      }

      const technician = await Technician.findById(technicianId)
        .select(
          "firstName lastName phone profilePicture currentStatus currentLocation assignedVehicle lastLocationAt lastHeartbeatAt"
        )
        .populate({
          path: "assignedVehicle",
          select: "plateNumber make model",
          populate: [
            { path: "make", select: "makeName" },
            { path: "model", select: "modelName" },
          ],
        });

      if (!technician) return;

      // Live Map only shows Online / On Job
      if (!["Online", "On Job"].includes(technician.currentStatus)) {
        const offId = technician._id.toString();
        adminLocationBatch.delete(offId);
        offlineTechnicians.add(offId);
        liveMap().emit("technicianOffline", { technician_id: offId });
        return;
      }

      // Back on the map — allow their location fanout again.
      offlineTechnicians.delete(technician._id.toString());

      liveMap().emit(
        "technicianOnline",
        buildAdminTechnicianPayload(technician)
      );
    } catch (err) {
      console.error("Error emitting admin technician presence:", err);
      captureException(err);
    }
  }

  // Admin namespace handlers
  adminNamespace.on("connection", (socket) => {
    devLog("Admin connected:", socket.id);

    socket.on("register", () => {
      const adminId = String(socket.user.id);
      socket.join(userRoom(adminId));
      socket.adminId = adminId;
      devLog(`Admin ${adminId} registered with socket ${socket.id}`);
    });

    // Opt in to the technician location/presence feed. Only the Live Map does.
    socket.on("joinLiveMap", () => {
      socket.join(LIVE_MAP_ROOM);
      devLog(`Admin ${socket.user?.id} joined the live map feed`);
    });

    socket.on("leaveLiveMap", () => {
      socket.leave(LIVE_MAP_ROOM);
    });

    // Admin claims SOS (Create Job) — first claim wins
    socket.on("sosAccepted", async (data) => {
      try {
        const { sos_id, customer_id } = data;
        const adminId = socket.user?.id;
        devLog(`Admin ${adminId} claiming SOS ${sos_id}`);

        const now = new Date();
        // First claim wins — the guard lives in the update filter so two dispatchers
        // racing on the same SOS cannot both pass a read-then-save check.
        // $min keeps the earliest stamp (and sets it when the field is absent),
        // matching the old `sos.in_call_at || now` semantics.
        const sos = await SOSRequest.findOneAndUpdate(
          {
            _id: sos_id,
            status: { $in: ["pending", "in_call"] },
            $or: [
              { claimed_by: null },
              { claimed_by: { $exists: false } },
              { claimed_by: adminId },
            ],
          },
          {
            $set: { status: "in_call", claimed_by: adminId },
            $min: { in_call_at: now, claimed_at: now },
          },
          { new: true }
        );

        if (!sos) {
          // Either the SOS is gone/terminal, or another dispatcher won the race.
          const current = await SOSRequest.findById(sos_id).select(
            "status claimed_by customer_id"
          );
          if (
            current &&
            ["pending", "in_call"].includes(current.status) &&
            current.claimed_by &&
            String(current.claimed_by) !== String(adminId)
          ) {
            socket.emit("error", {
              message: "SOS already claimed by another dispatcher",
              code: "SOS_ALREADY_CLAIMED",
              sos_id,
              claimed_by: current.claimed_by.toString(),
            });
            adminNamespace.emit("sosClaimed", {
              sos_id: current._id.toString(),
              admin_id: current.claimed_by.toString(),
              customer_id: String(current.customer_id),
            });
            return;
          }
          socket.emit("error", {
            message: "SOS is no longer available",
            code: "SOS_UNAVAILABLE",
            sos_id,
          });
          return;
        }

        clearSosTimers(sos._id);
        scheduleInCallExpiry(sos);

        adminNamespace.emit("sosClaimed", {
          sos_id: sos._id.toString(),
          admin_id: String(adminId),
          customer_id: String(sos.customer_id),
        });

        // Always the SOS's own customer, never a client-supplied id.
        await notifyCustomer(String(sos.customer_id), "sosInCall", {
          sos_id: sos._id.toString(),
          status: "in_call",
          claimed_at: sos.claimed_at,
          message:
            "An operator is reviewing your request and will call you shortly",
        });
      } catch (err) {
        console.error("Error handling sosAccepted:", err);
        captureException(err);
        socket.emit("error", { message: "Failed to claim SOS" });
      }
    });

    // Admin cancels job mid-job — same shared service as the REST endpoint
    // (POST /api/jobs/:id/cancel on the admin API). A paid job needs a refund
    // decision: { refund: "full"|"partial"|"none", refund_amount?, reason }.
    socket.on("adminCancelJob", async (data, ack) => {
      const reply = (payload) => {
        if (typeof ack === "function") {
          try {
            ack(payload);
          } catch (_) {
            /* ignore */
          }
        }
      };
      try {
        const { job_id, reason, refund, refund_amount, refund_reason } = data || {};
        // Same rule as the REST endpoint: only a full admin takes a refund
        // decision on a paid job (dispatchers cannot move money).
        if (refund && !["Super Admin", "Admin"].includes(String(socket.user?.role || ""))) {
          const denied = {
            message: "Only an admin can take a refund decision on a paid job",
            code: "REFUND_DECISION_FORBIDDEN",
            job_id,
          };
          socket.emit("error", denied);
          reply({ ok: false, ...denied });
          return;
        }
        devLog(`Admin cancelling job ${job_id}`);
        const { cancelJob } = require("../../../clicks-shared/services/cancelJob");
        const result = await cancelJob({
          jobId: job_id,
          actor: "admin",
          actorId: socket.user?.id,
          reason:
            (typeof reason === "string" && reason.trim()) || "Cancelled by admin",
          refund: refund
            ? {
                decision: refund,
                amount: refund_amount,
                reason: refund_reason || reason,
              }
            : undefined,
          notifier: {
            technicianPresence: (techId, status) =>
              emitAdminTechnicianPresence(techId, status),
            technicianJobEvent: (techId, event, payload) =>
              notifyTechnicianJobEvent(techId, event, payload),
          },
        });

        const confirmation = {
          ...(result.payload || {
            job_id: String(job_id),
            status: "cancelled",
          }),
          already_cancelled: !!result.alreadyCancelled,
          message: "Job cancelled successfully",
        };
        socket.emit("jobCancelled", confirmation);
        reply({ ok: true, ...confirmation });
        devLog(`Job ${job_id} cancelled by admin`);
      } catch (err) {
        if (!err.status || err.status >= 500) {
          console.error("Error cancelling job:", err);
          captureException(err);
        }
        const payload = {
          message: err.status ? err.message : "Failed to cancel job",
          code: err.code || "JOB_CANCEL_FAILED",
          job_id: data?.job_id,
        };
        socket.emit("error", payload);
        reply({ ok: false, ...payload });
      }
    });

    socket.on("disconnect", () => {
      if (socket.adminId) {
        devLog(`Admin ${socket.adminId} disconnected`);
      }
    });
  });

  // Customer namespace handlers
  customerNamespace.on("connection", (socket) => {
    devLog("Customer connected:", socket.id);

    // Customer registers their ID (from JWT — ignore client-supplied id)
    socket.on("register", () => {
      const customerId = String(socket.user.id);
      socket.join(userRoom(customerId));
      socket.customerId = customerId;
      devLog(`Customer ${customerId} registered with socket ${socket.id}`);
    });

    // Customer creates SOS request.
    //
    // Handshake (scenario 30): the client passes an ack callback and waits up
    // to 10 s for it; `sosCreated` also goes to the customer's room so every
    // device (and a reconnected socket) hears it. Idempotency (scenario 29):
    // a repeat with the same client_request_id, or a second device racing
    // into the unique "one live SOS" index, resolves to the existing SOS.
    socket.on("createSOS", async (data, ack) => {
      const reply = (payload) => {
        if (typeof ack === "function") {
          try {
            ack(payload);
          } catch (_) {
            /* client went away */
          }
        }
      };
      const emitSosError = (payload) => {
        socket.emit("error", payload);
        socket.emit("sosError", payload);
        reply({ ok: false, ...payload });
      };

      try {
        const { getLaunchFlags } = require("../utils/featureFlags");

        if (!getLaunchFlags().publicSos) {
          emitSosError({
            message: "SOS is temporarily disabled",
            code: "LAUNCH_PUBLIC_SOS_OFF",
          });
          return;
        }

        const customer_id = String(socket.user.id);
        // A socket that never sent `register` still gets the room events.
        socket.join(userRoom(customer_id));
        socket.customerId = customer_id;

        const body = data && typeof data === "object" ? data : {};
        const {
          customer_vehicle_id,
          latitude,
          longitude,
          skip_vehicle: skipVehicleRaw,
          service_type: serviceTypeRaw,
        } = body;
        const clientRequestId =
          typeof body.client_request_id === "string" &&
          body.client_request_id.trim()
            ? body.client_request_id.trim().slice(0, 64)
            : null;
        const skipVehicle =
          skipVehicleRaw === true ||
          skipVehicleRaw === "true" ||
          (!customer_vehicle_id && skipVehicleRaw !== false);
        const service_type =
          typeof serviceTypeRaw === "string" && serviceTypeRaw.trim()
            ? serviceTypeRaw.trim()
            : null;

        devLog("Received createSOS:", {
          customer_id,
          customer_vehicle_id,
          latitude,
          longitude,
          skipVehicle,
          service_type,
          clientRequestId,
        });

        const sosCreatedPayload = async (sos, extra = {}) => {
          const { isHighDemand } = require("../../../clicks-shared/utils/sosBusy");
          const highDemand = await isHighDemand().catch(() => false);
          return {
            sos_id: sos._id.toString(),
            status: sos.status,
            expires_at: sos.broadcast_expires_at,
            client_request_id: sos.client_request_id || null,
            outstanding_balance: sos.outstanding_balance || 0,
            outstanding_job_ids: (sos.outstanding_job_ids || []).map(String),
            high_demand: highDemand,
            ...extra,
          };
        };

        // Replay of a request we already accepted: same answer, no new SOS.
        if (clientRequestId) {
          const replay = await SOSRequest.findOne({
            customer_id,
            client_request_id: clientRequestId,
          });
          if (replay) {
            const payload = await sosCreatedPayload(replay, { duplicate: true });
            reply({ ok: true, ...payload });
            if (["pending", "in_call"].includes(replay.status)) {
              emitToUser(customerNamespace, customer_id, "sosCreated", payload);
            }
            return;
          }
        }

        if (
          latitude == null ||
          longitude == null ||
          Number.isNaN(Number(latitude)) ||
          Number.isNaN(Number(longitude))
        ) {
          emitSosError({
            message: "Location is required to create an SOS",
            code: "SOS_LOCATION_REQUIRED",
          });
          return;
        }

        try {
          const { assertInQatar } = require("../../../clicks-shared/utils/qatarCoverage");
          assertInQatar(latitude, longitude);
        } catch (coverageErr) {
          emitSosError({
            message: coverageErr.message,
            code: coverageErr.code || "OUTSIDE_COVERAGE",
          });
          return;
        }

        const activeSosError = (activeSos) => ({
          message: "You already have an active SOS request",
          code: "SOS_ALREADY_ACTIVE",
          sos_id: activeSos._id.toString(),
          status: activeSos.status,
          expires_at: activeSos.broadcast_expires_at,
        });

        const activeSos = await SOSRequest.findOne({
          customer_id,
          status: { $in: ["pending", "in_call"] },
        });
        if (activeSos) {
          emitSosError(activeSosError(activeSos));
          return;
        }

        // Throttle (scenario 36): every create pages every dispatcher.
        const throttleMax = Number(process.env.SOS_CREATE_MAX_PER_WINDOW || 3);
        const throttleWindowMs = durationEnv("SOS_CREATE_WINDOW_MS", 10 * 60 * 1000);
        const recentCount = await SOSRequest.countDocuments({
          customer_id,
          createdAt: { $gte: new Date(Date.now() - throttleWindowMs) },
        });
        if (Number.isFinite(throttleMax) && recentCount >= throttleMax) {
          recordAdminNotificationFireAndForget({
            type: "sos.throttled",
            title: "SOS throttled",
            body: `A customer hit the SOS limit (${throttleMax} in ${Math.round(
              throttleWindowMs / 60000
            )} min).`,
            data: { customer_id },
          });
          emitSosError({
            message:
              "You've sent several SOS requests in a short time. Please call us if you still need help.",
            code: "SOS_THROTTLED",
          });
          return;
        }

        try {
          const {
            assertCustomerCanCreateSos,
          } = require("../../../clicks-shared/utils/customerBookingGuard");
          await assertCustomerCanCreateSos({
            customerId: customer_id,
            customerVehicleId: customer_vehicle_id,
            skipVehicle,
          });
        } catch (bookErr) {
          emitSosError({
            message: bookErr.message,
            code: bookErr.code || "LIVE_JOB_ACTIVE",
          });
          return;
        }

        const pendingImmediateService = await ServiceRequest.findOne({
          customer_id,
          timing: "immediate",
          status: "pending",
        });
        if (pendingImmediateService) {
          emitSosError({
            message: "You already have a pending service request",
            code: "SERVICE_REQUEST_ALREADY_ACTIVE",
            service_request_id: pendingImmediateService._id.toString(),
          });
          return;
        }

        const customer = await Customer.findById(customer_id);
        if (!customer) {
          console.error('Customer not found:', customer_id);
          emitSosError({ message: 'Customer not found' });
          return;
        }

        let vehicle = null;
        if (!skipVehicle) {
          if (!customer_vehicle_id) {
            emitSosError({
              message: "Please select a vehicle or choose Skip vehicle",
              code: "SOS_VEHICLE_REQUIRED",
            });
            return;
          }
          vehicle = await CustomerVehicle.findById(customer_vehicle_id)
            .populate("vehicle_make")
            .populate("vehicle_model");
          if (!vehicle || !assertVehicleOwner(vehicle, socket.user)) {
            console.error("Vehicle not found:", customer_vehicle_id);
            emitSosError({
              message: "Vehicle not found",
              code: "SOS_VEHICLE_NOT_FOUND",
            });
            return;
          }
        }

        // Unpaid balance never blocks the SOS (scenario 91) — dispatch sees
        // it and the technician can collect it.
        const {
          outstandingBalanceForCustomer,
        } = require("../../../clicks-shared/utils/customerBookingGuard");
        const outstanding = await outstandingBalanceForCustomer(customer_id).catch(
          () => ({ outstanding_balance: 0, outstanding_job_ids: [] })
        );

        const accuracyRaw = Number(body.accuracy_m);
        const accuracyM =
          Number.isFinite(accuracyRaw) && accuracyRaw >= 0 ? accuracyRaw : null;
        const fixTimeRaw = body.fix_time ? new Date(body.fix_time) : null;
        const fixTime =
          fixTimeRaw && !Number.isNaN(fixTimeRaw.getTime()) ? fixTimeRaw : null;
        const locationSource = ["gps", "manual_pin"].includes(body.location_source)
          ? body.location_source
          : null;

        const expiresAt = new Date(Date.now() + broadcastMs());
        const {
          stampBusinessHours,
        } = require("../../../clicks-shared/utils/qatarBusinessHours");
        const hours = stampBusinessHours();

        const sos = new SOSRequest({
          customer_id,
          ...(vehicle ? { customer_vehicle_id: vehicle._id } : {}),
          location: {
            type: "Point",
            coordinates: [Number(longitude), Number(latitude)],
          },
          status: "pending",
          ...(service_type ? { service_type } : {}),
          broadcast_started_at: new Date(),
          broadcast_expires_at: expiresAt,
          after_hours: hours.after_hours,
          next_open_at: hours.next_open_at,
          client_request_id: clientRequestId,
          accuracy_m: accuracyM,
          fix_time: fixTime,
          location_source: locationSource,
          outstanding_balance: outstanding.outstanding_balance,
          outstanding_job_ids: outstanding.outstanding_job_ids,
        });

        try {
          await sos.save();
        } catch (saveErr) {
          if (saveErr?.code !== 11000) throw saveErr;
          // Lost the race to another device / a replay: hand back the winner.
          const winner =
            (clientRequestId &&
              (await SOSRequest.findOne({
                customer_id,
                client_request_id: clientRequestId,
              }))) ||
            (await SOSRequest.findOne({
              customer_id,
              status: { $in: ["pending", "in_call"] },
            }));
          if (
            winner &&
            clientRequestId &&
            winner.client_request_id === clientRequestId
          ) {
            const payload = await sosCreatedPayload(winner, { duplicate: true });
            reply({ ok: true, ...payload });
            emitToUser(customerNamespace, customer_id, "sosCreated", payload);
            return;
          }
          if (winner) {
            emitSosError(activeSosError(winner));
            return;
          }
          throw saveErr;
        }
        schedulePendingExpiry(sos);

        const createdPayload = await sosCreatedPayload(sos);
        reply({ ok: true, ...createdPayload });
        emitToUser(customerNamespace, customer_id, "sosCreated", createdPayload);

        const sosData = {
          sos_id: sos._id.toString(),
          customer_id: customer._id.toString(),
          customer_vehicle_id: vehicle ? vehicle._id.toString() : null,
          skip_vehicle: !vehicle,
          customer: {
            id: customer._id.toString(),
            name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unknown',
            phone: customer.phone_number || 'Unknown'
          },
          vehicle: vehicle
            ? {
                id: vehicle._id.toString(),
                make: vehicle.vehicle_make?.makeName || "Unknown",
                model: vehicle.vehicle_model?.modelName || "Unknown",
                year: vehicle.year || "Unknown",
                color: vehicle.vehicle_color || "Unknown",
                plate: vehicle.plate_number || "Unknown",
              }
            : {
                id: null,
                make: "Not provided",
                model: "—",
                year: "—",
                color: "—",
                plate: "—",
              },
          location: {
            latitude: Number(latitude),
            longitude: Number(longitude),
            coordinates: `${latitude}, ${longitude}`,
            accuracy_m: accuracyM,
            fix_time: fixTime,
            source: locationSource,
          },
          service_type,
          expires_at: expiresAt,
          status: "pending",
          escalation_level: 0,
          outstanding_balance: outstanding.outstanding_balance,
          outstanding_job_ids: outstanding.outstanding_job_ids.map(String),
          createdAt: sos.createdAt,
        };

        devLog(`Broadcasting SOS ${sos._id} to admin namespace`);
        adminNamespace.emit('newSOSRequest', sosData);
        recordAdminNotificationFireAndForget({
          type: "sos.new",
          title: "New SOS request",
          body: sosData.customer?.name
            ? `SOS from ${sosData.customer.name}`
            : "A customer submitted a new SOS request.",
          data: {
            sos_id: String(sos._id),
            customer_id: String(customer_id),
          },
        });
        sendAdminDispatchPush("admin_sos", {
          sos_id: String(sos._id),
          customer_id: String(customer_id),
        }).catch((err) => {
          console.error("[fcm] admin SOS push failed:", err.message);
        });

      } catch (err) {
        console.error("Error creating SOS:", err);
        captureException(err);
        const payload = { message: "Failed to create SOS request", details: err.message };
        socket.emit("error", payload);
        reply({ ok: false, code: "SOS_CREATE_FAILED", ...payload });
      }
    });

    // Customer cancels SOS. Conditional update (scenario 43): only an open
    // SOS with no job can be cancelled, so a job created a moment earlier
    // wins and the customer is told instead of being sent Home.
    socket.on("cancelSOS", async (data, ack) => {
      const reply = (payload) => {
        if (typeof ack === "function") {
          try {
            ack(payload);
          } catch (_) {
            /* ignore */
          }
        }
      };
      try {
        const { sos_id, reason } = data || {};
        const trimmedReason = typeof reason === "string" ? reason.trim() : "";

        if (
          !trimmedReason ||
          trimmedReason === "cancelled_by_customer" ||
          trimmedReason === "other"
        ) {
          const payload = {
            message: "Cancellation reason is required",
            code: "SOS_CANCEL_REASON_REQUIRED",
          };
          socket.emit("error", payload);
          reply({ ok: false, ...payload });
          return;
        }

        const customerId = String(socket.user.id);
        const sos = await SOSRequest.findOneAndUpdate(
          {
            _id: sos_id,
            customer_id: customerId,
            status: { $in: ["pending", "in_call"] },
            job_id: null,
          },
          {
            $set: {
              status: "cancelled",
              outcome: "cancelled",
              cancel_reason: trimmedReason.slice(0, 500),
            },
          },
          { new: true }
        );

        if (!sos) {
          const current = sos_id
            ? await SOSRequest.findById(sos_id).select("customer_id status job_id")
            : null;
          const own = current && assertSosAccess(current, socket.user);
          const payload = {
            message:
              own && current.job_id
                ? "A technician has already been dispatched for this SOS"
                : "SOS cannot be cancelled at this stage",
            code: own && current.job_id ? "SOS_JOB_CREATED" : "SOS_NOT_CANCELLABLE",
            ...(own ? { sos_id: String(current._id), status: current.status } : {}),
            ...(own && current.job_id ? { job_id: String(current.job_id) } : {}),
          };
          socket.emit("error", payload);
          reply({ ok: false, ...payload });
          return;
        }

        clearSosTimers(sos._id);
        const cancelledPayload = {
          sos_id: sos._id.toString(),
          status: "cancelled",
          cancel_reason: trimmedReason,
        };
        reply({ ok: true, ...cancelledPayload });
        emitToUser(customerNamespace, customerId, "sosCancelled", cancelledPayload);
        adminNamespace.emit("sosCancelled", {
          sos_id: sos._id.toString(),
          customer_id: String(sos.customer_id),
          cancel_reason: trimmedReason,
        });
        recordAdminNotificationFireAndForget({
          type: "sos.cancelled",
          title: "SOS cancelled",
          body: trimmedReason || "A customer cancelled their SOS request.",
          data: { sos_id: sos._id.toString() },
        });
      } catch (err) {
        console.error("Error cancelling SOS:", err);
        captureException(err);
        const payload = { message: "Failed to cancel SOS", details: err.message };
        socket.emit("error", payload);
        reply({ ok: false, ...payload });
      }
    });

    socket.on("disconnect", () => {
      if (socket.customerId) {
        devLog(`Customer ${socket.customerId} disconnected`);
      }
    });
  });

  // Technician namespace handlers
  technicianNamespace.on("connection", (socket) => {
    devLog("Technician connected:", socket.id);

    // Technician registers their ID (from JWT — ignore client-supplied id)
    socket.on("register", async (data) => {
      const technicianId = String(socket.user.id);
      // Cancel pending offline mark from a brief disconnect
      if (technicianOfflineTimers.has(technicianId)) {
        clearTimeout(technicianOfflineTimers.get(technicianId));
        technicianOfflineTimers.delete(technicianId);
      }
      socket.join(userRoom(technicianId));
      socket.technicianId = technicianId;
      devLog(`Technician ${technicianId} registered with socket ${socket.id}`);
      // The app opens this socket when it comes to the foreground, so register
      // is the closest signal there is to "opened the app".
      recordTechnicianActivity({
        technicianId,
        event: "session.app_opened",
        message: "Opened the technician app",
        metadata: { socket_id: socket.id, transport: socket.conn?.transport?.name },
      });
      // The grace timer only covers a disconnect this process is still holding.
      // A longer outage, or a redeploy, already flipped them Offline in the DB.
      await restoreAutoOfflinedTechnician(technicianId);
      if (data && typeof data === "object" && data.lifecycle === true) {
        try {
          await Technician.updateOne(
            { _id: technicianId },
            { appLifecycleCapable: true }
          );
        } catch (err) {
          console.error("Failed to mark technician lifecycle-capable:", err);
          captureException(err);
        }
      }
      // Reconnect / FGS wake: the socket itself is the app-alive signal.
      try {
        const tech = await Technician.findById(technicianId).select(
          "currentStatus currentLocation lastLocationAt lastHeartbeatAt"
        );
        if (tech && ["Online", "On Job"].includes(tech.currentStatus)) {
          await refreshPresenceFromLiveSocket(tech);
        }
      } catch (err) {
        console.error("Failed to refresh presence on technician register:", err);
        captureException(err);
      }
    });

    socket.on("appLifecycle", async (data) => {
      try {
        const technicianId = String(socket.user.id);
        await applyTechnicianAppLifecycle({
          Technician,
          technicianId,
          state: data?.state,
          recordTechnicianActivity,
        });
      } catch (err) {
        console.error("Error recording technician app lifecycle:", err);
        captureException(err);
      }
    });

    socket.on("updateLocation", async (data) => {
      try {
        const technician_id = String(socket.user.id);
        if (!data || typeof data !== "object") return;
        const { latitude, longitude, job_id, accuracy, fix_time } = data;
        if (!parseCoordinatePair(latitude, longitude)) {
          return;
        }

        const result = await applyTechnicianLocationWrite({
          Technician,
          technicianId: technician_id,
          latitude,
          longitude,
          accuracy,
          fixTime: fix_time,
          onAdminBroadcast: emitAdminTechnicianLocation,
        });

        if (!result.ok) return;

        // Throttled by the recorder — the app streams a fix every few seconds.
        if (result.coordsChanged) {
          recordTechnicianActivity({
            technicianId: technician_id,
            event: "location.updated",
            message: "Location ping while online",
            latitude: result.lat,
            longitude: result.lng,
            metadata: { source: "socket" },
          });
        }

        if (result.coordsChanged && job_id) {
          const job = await Job.findById(job_id);
          if (
            job &&
            assertSocketJobAccess(job, socket) &&
            job.customer_id
          ) {
            emitToUser(customerNamespace, job.customer_id.toString(), "locationUpdate", {
              job_id,
              latitude: result.lat,
              longitude: result.lng,
              timestamp: result.lastLocationAt || new Date(),
            });
          }
        }

        if (result.coordsChanged) {
          devLog(
            `Technician ${technician_id} location updated: [${result.lat}, ${result.lng}]`
          );
        }
      } catch (err) {
        console.error("Error updating technician location:", err);
        captureException(err);
      }
    });

    // Technician starts en route to customer (assigned → en_route)
    socket.on("startEnRoute", async (data) => {
      try {
        const { job_id } = data;
        devLog(`Technician starting en route for job ${job_id}`);

        const job = await Job.findById(job_id)
          .populate('assignedTechnician', 'firstName lastName phone profilePicture currentLocation');

        if (!job) {
          socket.emit("error", { message: "Job not found" });
          return;
        }
        if (!assertSocketJobAccess(job, socket)) {
          socket.emit("error", { message: "Forbidden" });
          return;
        }

        // Job must be in "accepted" status to start en route
        if (job.job_status !== "accepted") {
          socket.emit("error", { message: `Cannot start en route from status: ${job.job_status}` });
          return;
        }

        // CAS: a REST call racing this one cannot both move the job (and so
        // cannot both notify the customer).
        const enRouteAt = new Date();
        const moved = await Job.updateOne(
          { _id: job._id, job_status: "accepted" },
          { $set: { job_status: "en_route", en_route_at: enRouteAt } }
        );
        if (!moved.modifiedCount) {
          socket.emit("error", { message: "Job status changed — refresh and try again" });
          return;
        }
        job.job_status = "en_route";
        job.en_route_at = enRouteAt;

        // Confirm to technician
        socket.emit("enRouteConfirmed", {
          job_id,
          status: "en_route",
          en_route_at: job.en_route_at
        });

        notifyAdminJobStatus({
          job_id: String(job._id),
          status: "en_route",
          job_reference: job.job_reference,
          clientName: job.clientName,
          technician_id: job.assignedTechnician?._id
            ? String(job.assignedTechnician._id)
            : undefined,
          en_route_at: job.en_route_at,
        });

        // Notify customer
        if (job.customer_id) {
          await notifyCustomer(job.customer_id.toString(), "technicianEnRoute", {
            job_id: String(job._id),
            status: "en_route",
            en_route_at: job.en_route_at,
            technician: (() => {
              const tech = job.assignedTechnician;
              if (!tech) return undefined;
              const payload = {
                name: `${tech.firstName} ${tech.lastName}`,
                phone: tech.phone,
                photo: tech.profilePicture,
              };
              const coords = tech.currentLocation?.coordinates;
              if (Array.isArray(coords) && coords.length >= 2) {
                const lng = Number(coords[0]);
                const lat = Number(coords[1]);
                if (
                  Number.isFinite(lat) &&
                  Number.isFinite(lng) &&
                  !(lat === 0 && lng === 0)
                ) {
                  payload.latitude = lat;
                  payload.longitude = lng;
                }
              }
              return payload;
            })(),
          });
          devLog(`Customer ${job.customer_id} notified: technician en route`);
        }
      } catch (err) {
        console.error("Error starting en route:", err);
        captureException(err);
        socket.emit("error", { message: "Failed to start en route" });
      }
    });

    // ⚡ Technician marks as arrived (en_route → arrived)
    socket.on("markArrived", async (data) => {
      try {
        const { job_id } = data;
        devLog(`Technician marking arrived for job ${job_id}`);

        const job = await Job.findById(job_id);

        if (!job) {
          socket.emit("error", { message: "Job not found" });
          return;
        }
        if (!assertSocketJobAccess(job, socket)) {
          socket.emit("error", { message: "Forbidden" });
          return;
        }

        // Job must be in "en_route" status
        if (job.job_status !== "en_route") {
          socket.emit("error", { message: `Cannot mark arrived from status: ${job.job_status}` });
          return;
        }

        const arrivedAt = new Date();
        const moved = await Job.updateOne(
          { _id: job._id, job_status: "en_route" },
          { $set: { job_status: "arrived", arrived_at: arrivedAt } }
        );
        if (!moved.modifiedCount) {
          socket.emit("error", { message: "Job status changed — refresh and try again" });
          return;
        }
        job.job_status = "arrived";
        job.arrived_at = arrivedAt;

        // Confirm to technician
        socket.emit("arrivedConfirmed", {
          job_id,
          status: "arrived",
          arrived_at: job.arrived_at,
          message: "Arrival marked successfully"
        });

        notifyAdminJobStatus({
          job_id: String(job._id),
          status: "arrived",
          job_reference: job.job_reference,
          clientName: job.clientName,
          technician_id: job.assignedTechnician
            ? String(job.assignedTechnician)
            : undefined,
          arrived_at: job.arrived_at,
        });

        // Notify customer
        if (job.customer_id) {
          await notifyCustomer(job.customer_id.toString(), "technicianArrived", {
            job_id: String(job._id),
            status: "arrived",
            arrived_at: job.arrived_at,
          });
          devLog(`Customer ${job.customer_id} notified: technician arrived`);
        }
      } catch (err) {
        console.error("Error marking arrived:", err);
        captureException(err);
        socket.emit("error", { message: "Failed to mark as arrived" });
      }
    });

    // ⚡ Technician starts job (arrived → in_progress)
    // Prefer REST POST /api/jobs/:id/start — this handler mirrors the same gates.
    socket.on("startJob", async (data) => {
      try {
        const { job_id, latitude, longitude, lat, lng } = data || {};
        devLog(`Technician starting job ${job_id}`);

        const job = await Job.findById(job_id);

        if (!job) {
          socket.emit("error", { message: "Job not found" });
          return;
        }
        if (!assertSocketJobAccess(job, socket)) {
          socket.emit("error", { message: "Forbidden" });
          return;
        }

        // Job must be in "arrived" status
        if (job.job_status !== "arrived") {
          socket.emit("error", { message: `Cannot start job from status: ${job.job_status}` });
          return;
        }

        // Self-created jobs skip GPS proximity (creator === assignee).
        const isOwnJob = sameId(job.created_by_technician, job.assignedTechnician);

        if (!isOwnJob) {
          const maxMeters = Number(process.env.JOB_START_MAX_METERS || 200);
          let jobPoint = null;
          const coords = job.locationCoordinates?.coordinates;
          if (Array.isArray(coords) && coords.length >= 2) {
            jobPoint = { lat: Number(coords[1]), lng: Number(coords[0]) };
          } else {
            jobPoint = parseJobLocation(job.location);
          }
          if (!jobPoint) {
            socket.emit("error", {
              message: "Job location coordinates are missing; cannot verify proximity",
            });
            return;
          }

          let techLat = Number(latitude ?? lat);
          let techLng = Number(longitude ?? lng);
          if (!Number.isFinite(techLat) || !Number.isFinite(techLng)) {
            const tech = await Technician.findById(socket.user.id).select("currentLocation");
            const tc = tech?.currentLocation?.coordinates;
            if (Array.isArray(tc) && tc.length >= 2) {
              techLng = Number(tc[0]);
              techLat = Number(tc[1]);
            }
          }
          if (!Number.isFinite(techLat) || !Number.isFinite(techLng)) {
            socket.emit("error", { message: "Technician location is required to start the job" });
            return;
          }

          const distanceMeters = Math.round(
            distanceBetween({ lat: techLat, lng: techLng }, jobPoint)
          );
          if (distanceMeters > maxMeters) {
            socket.emit("error", {
              message: `You must be within ${maxMeters}m of the job location to start`,
              distanceMeters,
              maxMeters,
            });
            return;
          }
        }

        const startedAt = new Date();
        const moved = await Job.updateOne(
          { _id: job._id, job_status: "arrived" },
          { $set: { job_status: "in_progress", started_at: startedAt } }
        );
        if (!moved.modifiedCount) {
          socket.emit("error", { message: "Job status changed — refresh and try again" });
          return;
        }
        job.job_status = "in_progress";
        job.started_at = startedAt;

        // Confirm to technician
        socket.emit("jobStartedConfirmed", {
          job_id,
          status: "in_progress",
          started_at: job.started_at,
          message: "Job started successfully"
        });

        notifyAdminJobStatus({
          job_id: String(job._id),
          status: "in_progress",
          job_reference: job.job_reference,
          clientName: job.clientName,
          technician_id: job.assignedTechnician
            ? String(job.assignedTechnician)
            : undefined,
          started_at: job.started_at,
        });

        // Notify customer
        if (job.customer_id) {
          await notifyCustomer(job.customer_id.toString(), "jobStarted", {
            job_id: String(job._id),
            status: "in_progress",
            started_at: job.started_at,
            issue: job.issue || "",
          });
          devLog(`Customer ${job.customer_id} notified: job started`);
        }
      } catch (err) {
        console.error("Error starting job:", err);
        captureException(err);
        socket.emit("error", { message: "Failed to start job" });
      }
    });

    // ⚡ Technician confirms payment received (in_progress or legacy completed unpaid)
    // REST confirmPayment is source of truth for payment + receipt; this handler
    // is notify-only when payment_status is already paid. Tech stays On Job until complete.
    socket.on("paymentReceived", async (data) => {
      try {
        const { job_id } = data || {};
        devLog(`Technician confirming payment for job ${job_id}`);

        const job = await Job.findById(job_id)
          .populate("assignedTechnician", "firstName lastName phone profilePicture")
          .populate("customer_id", "first_name last_name phone_number email");

        if (!job) {
          socket.emit("error", { message: "Job not found" });
          return;
        }
        if (!assertSocketJobAccess(job, socket)) {
          socket.emit("error", { message: "Forbidden" });
          return;
        }

        if (!["in_progress", "completed"].includes(job.job_status)) {
          socket.emit("error", {
            message: `Cannot mark payment from status: ${job.job_status}. Job must be in progress (or completed unpaid).`,
          });
          return;
        }

        const buildReceiptData = () => ({
          job_id,
          customer: job.customer_id
            ? {
                name: `${job.customer_id.first_name} ${job.customer_id.last_name}`,
                phone: job.customer_id.phone_number,
                email: job.customer_id.email,
              }
            : null,
          technician: job.assignedTechnician
            ? {
                name: `${job.assignedTechnician.firstName} ${job.assignedTechnician.lastName}`,
                phone: job.assignedTechnician.phone,
              }
            : null,
          total_amount: job.price,
          payment_method: job.payment_method,
          paid_at: job.paid_at,
        });

        // Already paid through REST confirmPayment, which notified the customer:
        // confirm to the technician only. Notifying here again sent a second
        // "paid" push with job.price instead of pricing.total (scenario 71).
        if (job.payment_status === "paid") {
          const receiptData = buildReceiptData();
          socket.emit("paymentConfirmed", {
            job_id,
            job_status: job.job_status,
            payment_status: "paid",
            receipt: receiptData,
            message: "Payment already confirmed",
          });
          return;
        }

        // Not paid yet: this socket never takes payment. It used to mark the job
        // paid with any method, skipping the cash-only rule, the pending-card
        // check, the payment ledger and the receipt. Payment goes through REST
        // POST /api/jobs/:id/payment (the technician app calls it first).
        socket.emit("error", {
          message: "Confirm payment in the app first; this job is not marked paid.",
          code: "USE_REST_CONFIRM_PAYMENT",
          job_id,
        });
      } catch (err) {
        console.error("Error confirming payment:", err);
        captureException(err);
        socket.emit("error", { message: "Failed to confirm payment" });
      }
    });

    socket.on("disconnect", (reason) => {
      if (socket.technicianId) {
        const technicianId = socket.technicianId;
        devLog(`Technician ${technicianId} disconnected`);
        recordTechnicianDisconnectActivity({
          Technician,
          technicianId,
          reason,
          socketId: socket.id,
          recordTechnicianActivity,
        }).catch((err) => {
          console.error("Failed to record technician disconnect activity:", err);
          captureException(err);
        });

        // Grace window: if the tech reconnects quickly (or their REST heartbeats keep arriving)
        // we don't want to flip them Offline. Check lastHeartbeatAt before acting.
        if (technicianOfflineTimers.has(technicianId)) {
          clearTimeout(technicianOfflineTimers.get(technicianId));
        }
        const timer = setTimeout(async () => {
          technicianOfflineTimers.delete(technicianId);
          // If the tech reconnected via socket (any instance), leave them alone.
          if (await userHasLiveSockets(technicianNamespace, technicianId)) return;
          try {
            const tech = await Technician.findById(technicianId);
            if (!tech) return;
            if (tech.currentStatus === "Offline") {
              await emitAdminTechnicianPresence(technicianId, "Offline");
              return;
            }
            const locationAge = locationAgeMs(
              tech.lastHeartbeatAt || tech.lastLocationAt
            );

            // On Job: never auto-Offline — surface stale location instead.
            if (tech.currentStatus === "On Job") {
              scheduleOnJobStaleCheck(technicianId, locationAge);
              return;
            }

            // If a REST heartbeat arrived recently the app is still alive in background —
            // keep them Online. We'll re-check in LOCATION_STALE_MS.
            if (locationAge < LOCATION_STALE_MS) {
              devLog(`Technician ${technicianId} socket gone but REST heartbeat fresh (${Math.round(locationAge / 1000)}s ago) — keeping Online`);
              // Schedule a follow-up check after stale window expires.
              const followUp = setTimeout(async () => {
                technicianOfflineTimers.delete(technicianId);
                if (await userHasLiveSockets(technicianNamespace, technicianId)) return;
                try {
                  const t2 = await Technician.findById(technicianId);
                  if (!t2 || t2.currentStatus === "On Job") {
                    if (t2?.currentStatus === "On Job") {
                      const ageOnJob = locationAgeMs(
                        t2.lastHeartbeatAt || t2.lastLocationAt
                      );
                      scheduleOnJobStaleCheck(technicianId, ageOnJob);
                    }
                    return;
                  }
                  const age2 = locationAgeMs(
                    t2.lastHeartbeatAt || t2.lastLocationAt
                  );
                  if (age2 < LOCATION_STALE_MS) return; // still heartbeating
                  await markTechnicianAutoOffline(t2);
                  await emitAdminTechnicianPresence(technicianId, "Offline");
                  devLog(`Technician ${technicianId} marked Offline after heartbeat stale`);
                } catch (err) {
                  console.error("Failed to mark technician Offline on follow-up:", err);
                  captureException(err);
                }
              }, LOCATION_STALE_MS);
              followUp.unref?.();
              technicianOfflineTimers.set(technicianId, followUp);
              return;
            }
            // No fresh heartbeat — app is gone (force-quit / crash). Mark Offline now.
            await markTechnicianAutoOffline(tech);
            await emitAdminTechnicianPresence(technicianId, "Offline");
            devLog(`Technician ${technicianId} marked Offline after disconnect grace (no heartbeat)`);
          } catch (err) {
            console.error("Failed to mark technician Offline after disconnect:", err);
            captureException(err);
          }
        }, DISCONNECT_OFFLINE_MS);
        timer.unref?.();
        technicianOfflineTimers.set(technicianId, timer);
      }
    });
  });

  // ==================== HELPER FUNCTIONS ====================

  // Notify technician of new job assignment (called from /api/sos/notify-technician)
  async function notifyAssignedTechnician(jobId) {
    try {
      devLog(`notifyAssignedTechnician called with jobId: ${jobId}`);
      
      // Fetch job with all populated fields (+ fcm_token for push)
      const job = await Job.findById(jobId)
        .populate(
          "assignedTechnician",
          "firstName lastName phone profilePicture fcm_token currentLocation"
        )
        .populate('customer_id', 'first_name last_name phone_number')
        .populate({
          path: 'customer_vehicle_id',
          populate: [
            { path: 'vehicle_make' },
            { path: 'vehicle_model' }
          ]
        });

      if (!job) {
        devLog('Job not found:', jobId);
        return false;
      }

      if (!job.assignedTechnician) {
        devLog('No technician assigned to job:', jobId);
        return false;
      }

      const technicianId = job.assignedTechnician._id.toString();
      devLog(`Notifying technician ${technicianId} via user room...`);

      const customerName = job.customer_id
        ? `${job.customer_id.first_name || ''} ${job.customer_id.last_name || ''}`.trim()
        : (job.clientName || '');

      // Build job data to send to technician
      const jobData = {
        job_id: job._id.toString(),
        sos_id: job.sos_request_id?.toString() || null,
        customer: {
          id: job.customer_id?._id?.toString() || null,
          name: customerName,
          phone: job.customer_id?.phone_number || job.clientMobileNumber
        },
        vehicle: job.customer_vehicle_id ? {
          make: job.customer_vehicle_id.vehicle_make?.makeName || 'Unknown',
          model: job.customer_vehicle_id.vehicle_model?.modelName || 'Unknown',
          year: job.customer_vehicle_id.year || 'Unknown',
          color: job.customer_vehicle_id.vehicle_color || 'Unknown',
          plate: job.customer_vehicle_id.plate_number || 'Unknown'
        } : null,
        location: job.location,
        issue: job.issue,
        price: job.price,
        dateTime: job.dateTime,
        status: job.job_status
      };
      
      let socketOk = false;

      if (await userHasLiveSockets(technicianNamespace, technicianId)) {
        emitToUser(technicianNamespace, technicianId, "newJobAssigned", jobData);
        devLog(`✅ Technician ${technicianId} notified via socket room ${userRoom(technicianId)}`);
        devLog('Job data sent:', JSON.stringify(jobData, null, 2));
        socketOk = true;
      } else {
        devLog(`❌ Technician ${technicianId} is not connected (no sockets in room)`);
      }

      // Always attempt FCM so background / killed devices wake
      try {
        const { sendJobAssignedPush } = require("./fcmService");
        await sendJobAssignedPush(job.assignedTechnician, {
          type: "job_assigned",
          job_id: jobData.job_id,
          issue: jobData.issue || "",
          location: typeof jobData.location === "string"
            ? jobData.location
            : JSON.stringify(jobData.location || ""),
          price: jobData.price != null ? String(jobData.price) : "",
          customer_name: customerName,
          status: jobData.status || "assigned",
        });
      } catch (fcmErr) {
        console.error("[fcm] notifyAssignedTechnician push error:", fcmErr.message);
        captureException(fcmErr);
      }

      // Notify customer so waiting / service-request screens can advance
      if (job.customer_id?._id || job.customer_id) {
        const customerId = (job.customer_id._id || job.customer_id).toString();
        const tech = job.assignedTechnician;
        await notifyCustomerTechnicianAssigned(customerId, {
          job_id: job._id.toString(),
          sos_id: job.sos_request_id ? String(job.sos_request_id) : undefined,
          status: job.job_status,
          // Dedupe: a retried notify-technician for the same assignment is a no-op.
          assigned_at: job.assigned_at || job.updatedAt,
          technician: {
            name: `${tech.firstName || ""} ${tech.lastName || ""}`.trim(),
            phone: tech.phone,
            photo: tech.profilePicture,
            latitude: tech.currentLocation?.coordinates?.[1],
            longitude: tech.currentLocation?.coordinates?.[0],
          },
        });
      }

      return socketOk;
    } catch (error) {
      console.error("Error notifying technician:", error);
      captureException(error);
      return false;
    }
  }

  async function notifyJobReassigned(jobId, previousTechnicianId, { reason } = {}) {
    try {
      const prevId = String(previousTechnicianId || "").trim();
      if (!prevId) return false;

      const payload = {
        job_id: String(jobId),
        reason: reason || "",
        message: "This job has been reassigned to another technician",
      };

      if (await userHasLiveSockets(technicianNamespace, prevId)) {
        emitToUser(technicianNamespace, prevId, "jobReassigned", payload);
        devLog(`jobReassigned emitted to technician ${prevId}`);
      }

      const tech = await Technician.findById(prevId)
        .select("fcm_token firstName lastName")
        .lean();
      if (tech?.fcm_token) {
        try {
          const { sendJobReassignedPush } = require("./fcmService");
          await sendJobReassignedPush(tech, {
            job_id: payload.job_id,
            reason: payload.reason,
          });
        } catch (fcmErr) {
          console.error("[fcm] job_reassigned push error:", fcmErr.message);
        }
      }

      // The customer hears about the new technician from notify-technician
      // (notifyAssignedTechnician), which jobReassign calls right after this.
      // Notifying here too sent every reassignment twice.
      return true;
    } catch (error) {
      console.error("Error notifying job reassignment:", error);
      captureException(error);
      return false;
    }
  }

  /**
   * Customer notification for any transition (inbox -> socket room -> push),
   * via clicks-shared notifyCustomer. Never throws to the caller: the state
   * change already happened.
   */
  async function notifyCustomerJobEvent(customerId, event, data = {}, opts = {}) {
    try {
      if (!customerId || !event) return false;
      const result = await notifyCustomer(String(customerId), event, data || {}, opts);
      return !result?.skipped;
    } catch (error) {
      console.error(`Error notifying customer of ${event}:`, error);
      captureException(error);
      return false;
    }
  }

  async function notifyCustomerTechnicianAssigned(customerId, data) {
    return notifyCustomerJobEvent(customerId, "technicianAssigned", data);
  }

  async function notifyCustomerTechnicianAccepted(customerId, data) {
    return notifyCustomerJobEvent(customerId, "technicianAccepted", data);
  }

  async function notifySosClaimed({ sos_id, admin_id, customer_id }) {
    const sos = await SOSRequest.findById(sos_id);
    if (!sos) return false;

    clearSosTimers(sos._id);
    if (sos.status === "in_call" && !sos.job_id) {
      scheduleInCallExpiry(sos);
    }

    adminNamespace.emit("sosClaimed", {
      sos_id: String(sos_id),
      admin_id: String(admin_id || sos.claimed_by || ""),
      customer_id: String(customer_id || sos.customer_id),
    });
    recordAdminNotificationFireAndForget({
      type: "sos.claimed",
      title: "SOS claimed",
      body: "An operator claimed an SOS request.",
      data: {
        sos_id: String(sos_id),
        admin_id: String(admin_id || sos.claimed_by || ""),
        customer_id: String(customer_id || sos.customer_id),
      },
    });

    const sosPayload = {
      sos_id: String(sos_id),
      status: "in_call",
      claimed_at: sos.claimed_at,
      message:
        "An operator is reviewing your request and will call you shortly",
    };
    await notifyCustomerJobEvent(String(sos.customer_id), "sosInCall", sosPayload);
    return true;
  }

  async function notifySosOutcome({ sos_id, customer_id, event, payload } = {}) {
    const target = String(customer_id || "");
    const name = String(event || "").trim();
    if (!target || !name) return false;
    const data = { sos_id, ...(payload || {}) };
    await notifyCustomerJobEvent(target, name, data);
    return true;
  }

  async function notifyTechnicianJobEvent(technicianId, event, data) {
    try {
      if (!technicianId || !event) return false;
      emitToUser(technicianNamespace, String(technicianId), event, data);
      return true;
    } catch (error) {
      console.error(`Error emitting ${event} to technician:`, error);
      captureException(error);
      return false;
    }
  }

  /** Business portal → admin: partner request as Lead. */
  function notifyAdminBusinessLead(payload) {
    try {
      devLog(
        `Broadcasting business lead ${payload?.lead_id} to admin namespace`
      );
      adminNamespace.emit("newBusinessLead", payload);
      recordAdminNotificationFireAndForget({
        type: "lead.new",
        title: "New business lead",
        body: payload.business_name
          ? `Lead from ${payload.business_name}`
          : "A new business lead was submitted.",
        data: {
          lead_id: payload.lead_id ? String(payload.lead_id) : undefined,
          job_id: payload.job_id ? String(payload.job_id) : undefined,
          business_id: payload.business_id ? String(payload.business_id) : undefined,
        },
      });
      return true;
    } catch (error) {
      console.error("Error emitting newBusinessLead to admin:", error);
      captureException(error);
      return false;
    }
  }

  /** @deprecated Prefer notifyAdminBusinessLead. */
  function notifyAdminBusinessJob(payload) {
    try {
      devLog(
        `Broadcasting business job ${payload?.job_id || payload?.lead_id} to admin namespace`
      );
      if (payload?.lead_id) {
        adminNamespace.emit("newBusinessLead", payload);
        recordAdminNotificationFireAndForget({
          type: "lead.new",
          title: "New business lead",
          body: "A new business lead was submitted.",
          data: {
            lead_id: String(payload.lead_id),
            job_id: payload.job_id ? String(payload.job_id) : undefined,
          },
        });
      } else {
        adminNamespace.emit("newBusinessJob", payload);
        recordAdminNotificationFireAndForget({
          type: "job.business",
          title: "New business job",
          body: "A new business job was submitted.",
          data: {
            job_id: payload.job_id ? String(payload.job_id) : undefined,
            lead_id: payload.lead_id ? String(payload.lead_id) : undefined,
          },
        });
      }
      return true;
    } catch (error) {
      console.error("Error emitting newBusinessJob to admin:", error);
      captureException(error);
      return false;
    }
  }

  /** Technician-app created job → admin intake badge. */
  function notifyAdminTechnicianJob(payload) {
    try {
      devLog(
        `Broadcasting technician job ${payload?.job_id} to admin namespace`
      );
      adminNamespace.emit("newTechnicianJob", payload);
      recordAdminNotificationFireAndForget({
        type: "job.tech_created",
        title: "New technician job",
        body: payload.clientName
          ? `Job for ${payload.clientName}`
          : "A technician created a new job.",
        data: {
          job_id: payload.job_id ? String(payload.job_id) : undefined,
          technician_id: payload.technician_id
            ? String(payload.technician_id)
            : undefined,
        },
      });
      return true;
    } catch (error) {
      console.error("Error emitting newTechnicianJob to admin:", error);
      captureException(error);
      return false;
    }
  }

  /** Technician hold request → admin review queue. */
  function notifyAdminHoldRequest(payload) {
    try {
      devLog(
        `Broadcasting hold request for job ${payload?.job_id} to admin namespace`
      );
      adminNamespace.emit("holdRequestPending", payload);
      recordAdminNotificationFireAndForget({
        type: "job.hold_request",
        title: "Hold request pending",
        body: payload.clientName
          ? `${payload.clientName} — review hold request`
          : "A technician requested to place a job on hold.",
        data: {
          job_id: payload.job_id ? String(payload.job_id) : undefined,
          technician_id: payload.technician_id
            ? String(payload.technician_id)
            : undefined,
        },
      });
      return true;
    } catch (error) {
      console.error("Error emitting holdRequestPending to admin:", error);
      captureException(error);
      return false;
    }
  }

  function notifyAdminServiceRequest(payload) {
    try {
      devLog(
        `Broadcasting service request ${payload?.id || payload?._id} to admin namespace`
      );
      adminNamespace.emit("newServiceRequest", payload);
      recordAdminNotificationFireAndForget({
        type: "service_request.new",
        title: "New service request",
        body: payload.customer?.name
          ? `Service request from ${payload.customer.name}`
          : "A customer submitted a new service request.",
        data: {
          service_request_id: String(
            payload?.service_request_id || payload?.id || payload?._id || ""
          ),
          customer_id: payload.customer_id ? String(payload.customer_id) : undefined,
          lead_id: payload.lead_id ? String(payload.lead_id) : undefined,
        },
      });
      sendAdminDispatchPush("admin_service_request", {
        service_request_id: String(
          payload?.service_request_id || payload?.id || payload?._id || ""
        ),
        customer_id: String(payload?.customer_id || ""),
      }).catch((err) => {
        console.error("[fcm] admin service-request push failed:", err.message);
      });
      return true;
    } catch (error) {
      console.error("Error emitting newServiceRequest to admin:", error);
      captureException(error);
      return false;
    }
  }

  /** Technician lifecycle (en_route / arrived / in_progress / accepted) → admin UIs. */
  function notifyAdminJobStatus(payload) {
    try {
      if (!payload?.job_id || !payload?.status) return false;
      adminNamespace.emit("jobStatusUpdated", payload);
      return true;
    } catch (error) {
      console.error("Error emitting jobStatusUpdated to admin:", error);
      captureException(error);
      return false;
    }
  }

  function notifyAdminServiceRequestCancelled(payload) {
    try {
      adminNamespace.emit("serviceRequestCancelled", payload);
      recordAdminNotificationFireAndForget({
        type: "service_request.cancelled",
        title: "Service request cancelled",
        body: "A customer cancelled a service request.",
        data: {
          service_request_id: String(
            payload?.service_request_id || payload?.id || payload?._id || ""
          ),
        },
      });
      return true;
    } catch (error) {
      console.error("Error emitting serviceRequestCancelled to admin:", error);
      captureException(error);
      return false;
    }
  }

  /**
   * A technician handed a job back (scenario 48): the job is pending again.
   * Dispatch needs to re-assign it; the customer hears "finding another
   * technician" rather than silence.
   */
  async function notifyJobRedispatch({
    job_id,
    customer_id,
    technician_id,
    sos_id,
    reason,
    released_at,
  } = {}) {
    try {
      const payload = {
        job_id: String(job_id || ""),
        sos_id: sos_id ? String(sos_id) : null,
        previous_technician_id: technician_id ? String(technician_id) : null,
        reason: reason || "",
        status: "pending",
      };
      adminNamespace.emit("jobNeedsRedispatch", payload);
      adminNamespace.emit("jobStatusUpdated", { ...payload, status: "pending" });
      recordAdminNotificationFireAndForget({
        type: "job.redispatch",
        title: "Job needs a new technician",
        body: reason
          ? `The technician cancelled: ${String(reason).slice(0, 120)}`
          : "The technician cancelled and the job is back in the queue.",
        data: { job_id: payload.job_id, sos_id: payload.sos_id || undefined },
      });
      Promise.resolve()
        .then(() =>
          sendAdminDispatchPush("admin_sos", {
            job_id: payload.job_id,
            redispatch: "1",
          })
        )
        .catch((err) => {
          console.error("[fcm] admin redispatch push failed:", err.message);
        });
      if (customer_id) {
        const customerPayload = {
          job_id: payload.job_id,
          sos_id: payload.sos_id,
          status: "pending",
          released_at: released_at || undefined,
          message: "Your technician couldn't continue. We're finding another technician for you.",
        };
        await notifyCustomerJobEvent(String(customer_id), "jobReassigning", customerPayload);
      }
      return true;
    } catch (error) {
      console.error("Error notifying job redispatch:", error);
      captureException(error);
      return false;
    }
  }

  /** Delivery side of the SOS escalation sweeper (clicks-shared/services/sosEscalation). */
  const sosEscalationNotifier = {
    adminAlert: (event, payload) => {
      adminNamespace.emit(event, payload);
    },
    adminPush: (type, payload) => sendAdminDispatchPush(type, payload),
    recordAdminNotification: (row) => recordAdminNotificationFireAndForget(row),
    customerEvent: (customerId, event, payload) =>
      notifyCustomerJobEvent(String(customerId), event, payload),
    sendSms: async (to, message) => {
      const { sendSMS } = require("./smsService");
      return sendSMS(to, message);
    },
  };

  return {
    customerNamespace,
    technicianNamespace,
    adminNamespace,
    notifyJobRedispatch,
    sosEscalationNotifier,
    notifyAssignedTechnician,
    notifyJobReassigned,
    notifyCustomerTechnicianAssigned,
    notifyCustomerTechnicianAccepted,
    notifyCustomerJobEvent,
    notifyAdminTechnicianPresence: emitAdminTechnicianPresence,
    notifyAdminTechnicianLocation: emitAdminTechnicianLocation,
    notifySosClaimed,
    notifySosOutcome,
    notifyTechnicianJobEvent,
    notifyAdminBusinessLead,
    notifyAdminBusinessJob,
    notifyAdminTechnicianJob,
    notifyAdminJobStatus,
    notifyAdminHoldRequest,
    notifyAdminServiceRequest,
    notifyAdminServiceRequestCancelled,
    stopAdminLocationBatchTimer: () => clearInterval(adminLocationBatchTimer),
  };
}

module.exports = { initializeSOSSocket };
