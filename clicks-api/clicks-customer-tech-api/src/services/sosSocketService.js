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
const { sendAdminDispatchPush } = require("./fcmService");
const {
  recordAdminNotificationFireAndForget,
} = require("./notificationRecordService");
const {
  TECH_BUSY_JOB_STATUSES,
} = require("../../../clicks-shared/constants/jobStatuses");

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
  return {
    technician_id: technician._id.toString(),
    firstName: technician.firstName,
    lastName: technician.lastName,
    phone: technician.phone,
    profilePicture: technician.profilePicture,
    currentStatus: technician.currentStatus,
    location: { latitude, longitude },
    lastLocationAt,
    locationStale: isLocationStale(technician.lastLocationAt),
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
    emitToUser(customerNamespace, customerId, "sosExpired", payload);
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

  // On Job force-quit: emit stale (not Offline) when lastLocationAt exceeds window.
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - LOCATION_STALE_MS);
      const staleOnJob = await Technician.find({
        currentStatus: "On Job",
        isActive: true,
        $or: [{ lastLocationAt: { $lt: cutoff } }, { lastLocationAt: null }],
      }).select("_id lastLocationAt");
      for (const t of staleOnJob) {
        const id = t._id.toString();
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
      await Technician.updateOne({ _id: technicianId }, { autoOfflineAt: null });
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
        $or: [{ lastLocationAt: { $lt: cutoff } }, { lastLocationAt: null }],
      });
      for (const tech of ghosts) {
        const technicianId = tech._id.toString();
        // A disconnect timer in this process is already on the case.
        if (technicianOfflineTimers.has(technicianId)) continue;
        if (await userHasLiveSockets(technicianNamespace, technicianId)) continue;
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

  function emitAdminTechnicianLocationStale(technician_id, lastLocationAt) {
    const id = technician_id.toString();
    staleLocationEmittedFor.add(id);
    liveMap().emit("technicianLocationStale", {
      technician_id: id,
      lastLocationAt: lastLocationAt
        ? new Date(lastLocationAt).toISOString()
        : null,
      locationStale: true,
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

  function emitAdminTechnicianLocation(technician_id, latitude, longitude, updatedAt) {
    const id = technician_id.toString();
    if (offlineTechnicians.has(id)) return;
    staleLocationEmittedFor.delete(id);
    const iso = updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString();

    adminLocationBatch.set(id, {
      technician_id: id,
      latitude,
      longitude,
      updatedAt: iso,
      lastLocationAt: iso,
      locationStale: false,
    });

    if (ADMIN_MAP_LEGACY_EVENTS) {
      liveMap().emit("technicianLocationUpdate", {
        technician_id: id,
        latitude,
        longitude,
        updatedAt: iso,
        lastLocationAt: iso,
        locationStale: false,
      });
    }
  }

  /** On Job techs stay on the map but surface stale when heartbeat stops. */
  function scheduleOnJobStaleCheck(technicianId, locationAge) {
    const checkAndEmit = async () => {
      if (await userHasLiveSockets(technicianNamespace, technicianId)) return;
      try {
        const t = await Technician.findById(technicianId).select(
          "currentStatus lastLocationAt"
        );
        if (!t || t.currentStatus !== "On Job") return;
        if (locationAgeMs(t.lastLocationAt) >= LOCATION_STALE_MS) {
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
          "firstName lastName phone profilePicture currentStatus currentLocation assignedVehicle lastLocationAt"
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

        const targetCustomerId = String(customer_id || sos.customer_id);
        emitToUser(customerNamespace, targetCustomerId, "sosInCall", {
          sos_id: sos._id.toString(),
          status: "in_call",
          message:
            "An operator is reviewing your request and will call you shortly",
        });
      } catch (err) {
        console.error("Error handling sosAccepted:", err);
        captureException(err);
        socket.emit("error", { message: "Failed to claim SOS" });
      }
    });

    // Admin cancels job mid-job
    socket.on("adminCancelJob", async (data) => {
      try {
        const { job_id, customer_id, technician_id, reason } = data;
        devLog(`Admin cancelling job ${job_id}`);

        // Get job first to find linked SOS
        const jobBefore = await Job.findById(job_id);

        if (!jobBefore) {
          socket.emit("error", { message: "Job not found" });
          return;
        }

        const cancellationReason =
          (typeof reason === "string" && reason.trim()) || 'Cancelled by admin';
        const cancelledAt = new Date();

        // Never re-cancel a terminal job: a completed/paid job has already issued a
        // receipt, credited the technician and accrued partner commission, so
        // flipping it to cancelled desyncs the books.
        const job = await Job.findOneAndUpdate(
          {
            _id: job_id,
            job_status: {
              $in: [
                'pending',
                'assigned',
                'accepted',
                'en_route',
                'arrived',
                'in_progress',
              ],
            },
            payment_status: { $ne: 'paid' },
          },
          {
            job_status: 'cancelled',
            cancelled_at: cancelledAt,
            cancellation_reason: cancellationReason,
            cancelled_by: 'admin'
          },
          { new: true }
        );

        if (!job) {
          socket.emit("error", {
            message: `Cannot cancel job in status ${jobBefore.job_status} (payment ${jobBefore.payment_status})`,
            code: "JOB_NOT_CANCELLABLE",
            job_id,
          });
          return;
        }

        // Cancel the linked SOS request if exists
        if (jobBefore && jobBefore.sos_request_id) {
          await SOSRequest.findByIdAndUpdate(jobBefore.sos_request_id, {
            status: 'cancelled'
          });
          devLog(`SOS ${jobBefore.sos_request_id} cancelled due to job cancellation`);
        }

        // Update technician status back to "Online" if assigned
        const techId =
          technician_id ||
          job.assignedTechnician?.toString?.() ||
          job.assignedTechnician;
        if (techId) {
          // A technician may hold several live jobs at once — only free them up
          // if this was their last one, otherwise dispatch/Live Map treat them
          // as available while they are still working.
          const stillBusy = await Job.exists({
            assignedTechnician: techId,
            _id: { $ne: job._id },
            job_status: { $in: TECH_BUSY_JOB_STATUSES },
          });
          const nextStatus = stillBusy ? "On Job" : "Online";
          await setTechnicianStatus(techId, nextStatus);
          await emitAdminTechnicianPresence(techId, nextStatus);
          devLog(`Technician ${techId} status reset to ${nextStatus}`);
        }

        const cancellationData = {
          job_id,
          status: "cancelled",
          reason: cancellationReason,
          cancelled_at: cancelledAt
        };

        // Notify customer
        if (customer_id) {
          emitToUser(
            customerNamespace,
            customer_id.toString(),
            "jobCancelled",
            cancellationData
          );
          devLog(`Customer ${customer_id} notified: job cancelled`);
        }

        // Notify technician
        if (technician_id) {
          emitToUser(
            technicianNamespace,
            technician_id.toString(),
            "jobCancelled",
            cancellationData
          );
          devLog(`Technician ${technician_id} notified: job cancelled`);
        }

        // Confirm to admin
        socket.emit("jobCancelled", {
          ...cancellationData,
          message: "Job cancelled successfully"
        });

        devLog(`Job ${job_id} cancelled by admin`);
      } catch (err) {
        console.error("Error cancelling job:", err);
        captureException(err);
        socket.emit("error", { message: "Failed to cancel job" });
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

    // Customer creates SOS request
    socket.on("createSOS", async (data) => {
      try {
        const { getLaunchFlags } = require("../utils/featureFlags");
        const emitSosError = (payload) => {
          socket.emit("error", payload);
          socket.emit("sosError", payload);
        };

        if (!getLaunchFlags().publicSos) {
          emitSosError({
            message: "SOS is temporarily disabled",
            code: "LAUNCH_PUBLIC_SOS_OFF",
          });
          return;
        }

        const customer_id = String(socket.user.id);
        const {
          customer_vehicle_id,
          latitude,
          longitude,
          skip_vehicle: skipVehicleRaw,
          service_type: serviceTypeRaw,
        } = data;
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
        });

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

        const activeSos = await SOSRequest.findOne({
          customer_id,
          status: { $in: ["pending", "in_call"] },
        });
        if (activeSos) {
          emitSosError({
            message: "You already have an active SOS request",
            code: "SOS_ALREADY_ACTIVE",
            sos_id: activeSos._id.toString(),
            status: activeSos.status,
            expires_at: activeSos.broadcast_expires_at,
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

        const expiresAt = new Date(Date.now() + broadcastMs());

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
        });

        await sos.save();
        schedulePendingExpiry(sos);

        socket.emit("sosCreated", {
          sos_id: sos._id,
          status: "pending",
          expires_at: expiresAt
        });

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
            coordinates: `${latitude}, ${longitude}`
          },
          service_type,
          expires_at: expiresAt,
          status: "pending",
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
        socket.emit("error", { message: "Failed to create SOS request", details: err.message });
      }
    });

    // Customer cancels SOS
    socket.on("cancelSOS", async (data) => {
      try {
        const { sos_id, reason } = data;
        const trimmedReason = typeof reason === "string" ? reason.trim() : "";

        if (
          !trimmedReason ||
          trimmedReason === "cancelled_by_customer" ||
          trimmedReason === "other"
        ) {
          socket.emit("error", {
            message: "Cancellation reason is required",
            code: "SOS_CANCEL_REASON_REQUIRED",
          });
          return;
        }

        const sos = await SOSRequest.findById(sos_id);

        // Only the customer who raised the SOS may cancel it.
        if (!assertSosAccess(sos, socket.user)) {
          socket.emit("error", {
            message: "SOS cannot be cancelled at this stage",
            code: "SOS_NOT_CANCELLABLE",
          });
          return;
        }

        if (sos && ["pending", "in_call"].includes(sos.status) && !sos.job_id) {
          sos.status = "cancelled";
          sos.cancel_reason = trimmedReason;
          await sos.save();
          clearSosTimers(sos._id);

          socket.emit("sosCancelled", { sos_id, status: "cancelled", cancel_reason: trimmedReason });
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
        } else {
          socket.emit("error", {
            message: "SOS cannot be cancelled at this stage",
            code: "SOS_NOT_CANCELLABLE",
          });
        }
      } catch (err) {
        console.error("Error cancelling SOS:", err);
        captureException(err);
        socket.emit("error", { message: "Failed to cancel SOS", details: err.message });
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
    socket.on("register", async () => {
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

        job.job_status = "en_route";
        job.en_route_at = new Date();
        await job.save();

        // Confirm to technician
        socket.emit("enRouteConfirmed", {
          job_id,
          status: "en_route",
          en_route_at: job.en_route_at
        });

        // Notify customer
        if (job.customer_id) {
          emitToUser(customerNamespace, job.customer_id.toString(), "technicianEnRoute", {
            job_id,
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

        job.job_status = "arrived";
        job.arrived_at = new Date();
        await job.save();

        // Confirm to technician
        socket.emit("arrivedConfirmed", {
          job_id,
          status: "arrived",
          arrived_at: job.arrived_at,
          message: "Arrival marked successfully"
        });

        // Notify customer
        if (job.customer_id) {
          emitToUser(customerNamespace, job.customer_id.toString(), "technicianArrived", {
            job_id,
            status: "arrived",
            arrived_at: job.arrived_at
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

        job.job_status = "in_progress";
        job.started_at = new Date();
        await job.save();

        // Confirm to technician
        socket.emit("jobStartedConfirmed", {
          job_id,
          status: "in_progress",
          started_at: job.started_at,
          message: "Job started successfully"
        });

        // Notify customer
        if (job.customer_id) {
          emitToUser(customerNamespace, job.customer_id.toString(), "jobStarted", {
            job_id,
            status: "in_progress",
            started_at: job.started_at
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
        const { job_id, payment_method } = data;
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

        const notifyCustomerPaid = async (receiptData) => {
          const customerId = job.customer_id?._id?.toString();
          const paymentPayload = {
            job_id,
            job_status: job.job_status,
            payment_status: "paid",
            total_amount: job.price,
            receipt: receiptData,
            technician: job.assignedTechnician
              ? {
                  name: `${job.assignedTechnician.firstName} ${job.assignedTechnician.lastName}`,
                  photo: job.assignedTechnician.profilePicture,
                }
              : null,
          };
          if (customerId) {
            emitToUser(customerNamespace, customerId, "paymentConfirmed", paymentPayload);
            devLog(`Customer ${customerId} notified: payment received`);
            await pushCustomerEvent(customerId, "paymentConfirmed", paymentPayload);
          }
        };

        // Idempotent notify-only path after REST confirmPayment
        if (job.payment_status === "paid") {
          const receiptData = buildReceiptData();
          socket.emit("paymentConfirmed", {
            job_id,
            job_status: job.job_status,
            payment_status: "paid",
            receipt: receiptData,
            message: "Payment already confirmed",
          });
          notifyCustomerPaid(receiptData);
          return;
        }

        // Legacy fallback: mutate payment if REST was not used
        job.payment_status = "paid";
        job.payment_method = payment_method || job.payment_method || "cash";
        job.paid_at = new Date();
        await job.save();

        const receiptData = buildReceiptData();
        receiptData.payment_method = job.payment_method;
        receiptData.paid_at = job.paid_at;

        socket.emit("paymentConfirmed", {
          job_id,
          job_status: job.job_status,
          payment_status: "paid",
          receipt: receiptData,
          message: "Payment confirmed successfully",
        });

        notifyCustomerPaid(receiptData);
      } catch (err) {
        console.error("Error confirming payment:", err);
        captureException(err);
        socket.emit("error", { message: "Failed to confirm payment" });
      }
    });

    socket.on("disconnect", () => {
      if (socket.technicianId) {
        const technicianId = socket.technicianId;
        devLog(`Technician ${technicianId} disconnected`);
        recordTechnicianActivity({
          technicianId,
          event: "session.app_closed",
          message: "App went to background or lost connection",
          metadata: { socket_id: socket.id },
        });

        // Grace window: if the tech reconnects quickly (or their REST heartbeats keep arriving)
        // we don't want to flip them Offline. Check lastLocationAt before acting.
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
            const locationAge = tech.lastLocationAt
              ? Date.now() - new Date(tech.lastLocationAt).getTime()
              : Infinity;

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
                      const ageOnJob = t2.lastLocationAt
                        ? Date.now() - new Date(t2.lastLocationAt).getTime()
                        : Infinity;
                      scheduleOnJobStaleCheck(technicianId, ageOnJob);
                    }
                    return;
                  }
                  const age2 = t2.lastLocationAt
                    ? Date.now() - new Date(t2.lastLocationAt).getTime()
                    : Infinity;
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

  async function pushCustomerEvent(customerId, event, data = {}) {
    try {
      const { sendCustomerPush } = require("./fcmService");
      const jobId =
        data.job_id?.toString?.() ||
        data.job_id ||
        data.jobId?.toString?.() ||
        "";
      await sendCustomerPush(customerId, {
        event,
        type: event,
        job_id: jobId,
        sos_id: data.sos_id?.toString?.() || data.sos_id || "",
        ...data,
      });
    } catch (fcmErr) {
      console.error(`[fcm] customer ${event} push error:`, fcmErr.message);
      captureException(fcmErr);
    }
  }

  // Notify customer that technician was assigned
  async function notifyCustomerTechnicianAssigned(customerId, data) {
    try {
      devLog(`Notifying customer ${customerId} of technician assignment`);
      let socketOk = false;

      if (await userHasLiveSockets(customerNamespace, customerId.toString())) {
        emitToUser(customerNamespace, customerId.toString(), "technicianAssigned", data);
        devLog(`Customer ${customerId} notified via socket room ${userRoom(customerId)}`);
        socketOk = true;
      } else {
        devLog(`Customer ${customerId} is not connected`);
      }

      await pushCustomerEvent(customerId, "technicianAssigned", data);
      return socketOk;
    } catch (error) {
      console.error("Error notifying customer:", error);
      captureException(error);
      return false;
    }
  }

  // Notify customer of technician acceptance
  async function notifyCustomerTechnicianAccepted(customerId, data) {
    try {
      devLog(`Notifying customer ${customerId} of technician acceptance`);
      let socketOk = false;

      if (await userHasLiveSockets(customerNamespace, customerId.toString())) {
        emitToUser(customerNamespace, customerId.toString(), "technicianAccepted", data);
        devLog(`Customer ${customerId} notified of acceptance via socket room ${userRoom(customerId)}`);
        socketOk = true;
      } else {
        devLog(`Customer ${customerId} is not connected`);
      }

      await pushCustomerEvent(customerId, "technicianAccepted", data);
      return socketOk;
    } catch (error) {
      console.error("Error notifying customer of acceptance:", error);
      captureException(error);
      return false;
    }
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

    const targetCustomerId = String(customer_id || sos.customer_id);
    const sosPayload = {
      sos_id: String(sos_id),
      status: "in_call",
      message:
        "An operator is reviewing your request and will call you shortly",
    };
    emitToUser(customerNamespace, targetCustomerId, "sosInCall", sosPayload);
    await pushCustomerEvent(targetCustomerId, "sosInCall", sosPayload);
    return true;
  }

  /** Notify customer of fulfill-path status from REST controllers */
  async function notifyCustomerJobEvent(customerId, event, data) {
    try {
      let socketOk = false;
      if (await userHasLiveSockets(customerNamespace, String(customerId))) {
        emitToUser(customerNamespace, String(customerId), event, data);
        socketOk = true;
      }
      const { CUSTOMER_PUSH_EVENTS } = require("./fcmService");
      if (CUSTOMER_PUSH_EVENTS.has(event)) {
        await pushCustomerEvent(customerId, event, data);
      }
      return socketOk;
    } catch (error) {
      console.error(`Error emitting ${event} to customer:`, error);
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

  return { 
    customerNamespace, 
    technicianNamespace, 
    adminNamespace,
    notifyAssignedTechnician,
    notifyCustomerTechnicianAssigned,
    notifyCustomerTechnicianAccepted,
    notifyCustomerJobEvent,
    notifyAdminTechnicianPresence: emitAdminTechnicianPresence,
    notifyAdminTechnicianLocation: emitAdminTechnicianLocation,
    notifySosClaimed,
    notifyAdminBusinessLead,
    notifyAdminBusinessJob,
    notifyAdminTechnicianJob,
    notifyAdminHoldRequest,
    notifyAdminServiceRequest,
    notifyAdminServiceRequestCancelled,
    stopAdminLocationBatchTimer: () => clearInterval(adminLocationBatchTimer),
  };
}

module.exports = { initializeSOSSocket };
