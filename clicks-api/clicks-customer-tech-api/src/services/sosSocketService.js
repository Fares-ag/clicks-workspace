const jwt = require("jsonwebtoken");
const {
  SOSRequest,
  ServiceRequest,
  Technician,
  Job,
  Customer,
  CustomerVehicle,
} = require("../../../clicks-shared/models");
const { broadcastMs, inCallTimeoutMs } = require("../utils/sosTimeout");
const { setTechnicianStatus } = require("../../../clicks-shared/services/technicianOnlineHours");
const { assertJobAccess } = require("../utils/ownership");
const { parseJobLocation } = require("../../../clicks-shared/utils/parseJobLocation");
const { distanceBetween } = require("../../../clicks-shared/utils/geoDistance");

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
 * Admin JWT roles may be "Super Admin", "Admin", "Job Dispatcher", etc.
 */
function isAllowedAdminRole(role) {
  if (role == null) return false;
  const r = String(role);
  if (r === "customer" || r === "technician") return false;
  if (r.includes("Admin")) return true;
  if (["Job Dispatcher", "Coordinator", "Call Center Agent"].includes(r)) return true;
  // Any other non-customer/technician staff role
  return true;
}

function attachNamespaceAuth(namespace, expectedRole) {
  namespace.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Unauthorized"));
    if (!process.env.JWT_SECRET) return next(new Error("Unauthorized"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (expectedRole === "admin") {
        if (!isAllowedAdminRole(decoded.role)) {
          return next(new Error("Unauthorized"));
        }
      } else if (decoded.role !== expectedRole) {
        return next(new Error("Unauthorized"));
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
const DEFAULT_LOCATION_STALE_MS = Number(process.env.TECH_LOCATION_STALE_MS || 60000);

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

  // Store socket connections mapped to user IDs
  const customerSockets = new Map(); // customer_id -> socket.id
  const technicianSockets = new Map(); // technician_id -> socket.id
  const adminSockets = new Map(); // admin_id -> socket.id
  /** Grace timers so brief reconnects don't yank Offline on Live Map */
  const technicianOfflineTimers = new Map(); // technician_id -> timeout
  /** Dedup On Job stale broadcasts (cleared on fresh location) */
  const staleLocationEmittedFor = new Set();

  const pendingExpireTimers = new Map(); // sosId -> timeout
  const inCallExpireTimers = new Map(); // sosId -> timeout
  const DISCONNECT_OFFLINE_MS = Number(process.env.TECH_DISCONNECT_OFFLINE_MS || 30000);
  // How long without a location heartbeat before we consider the tech truly gone (force-quit).
  const LOCATION_STALE_MS = Number(process.env.TECH_LOCATION_STALE_MS || 60000);

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
    const customerSocketId = customerSockets.get(customerId);
    const payload = {
      sos_id: sos._id.toString(),
      message:
        message ||
        "No dispatcher accepted your SOS request in time. Please try again or call support.",
    };
    if (customerSocketId) {
      customerNamespace.to(customerSocketId).emit("sosExpired", payload);
    }
    adminNamespace.emit("sosExpired", payload);
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
    }
  }, 30000).unref?.();

  function emitAdminTechnicianLocationStale(technician_id, lastLocationAt) {
    const id = technician_id.toString();
    staleLocationEmittedFor.add(id);
    adminNamespace.emit("technicianLocationStale", {
      technician_id: id,
      lastLocationAt: lastLocationAt
        ? new Date(lastLocationAt).toISOString()
        : null,
      locationStale: true,
    });
  }

  function emitAdminTechnicianLocation(technician_id, latitude, longitude, updatedAt) {
    const id = technician_id.toString();
    staleLocationEmittedFor.delete(id);
    const iso = updatedAt ? new Date(updatedAt).toISOString() : new Date().toISOString();
    adminNamespace.emit("technicianLocationUpdate", {
      technician_id: id,
      latitude,
      longitude,
      updatedAt: iso,
      lastLocationAt: iso,
      locationStale: false,
    });
  }

  /** On Job techs stay on the map but surface stale when heartbeat stops. */
  function scheduleOnJobStaleCheck(technicianId, locationAge) {
    const checkAndEmit = async () => {
      if (technicianSockets.has(technicianId)) return;
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
        adminNamespace.emit("technicianOffline", {
          technician_id: technicianId.toString(),
        });
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
        adminNamespace.emit("technicianOffline", {
          technician_id: technician._id.toString(),
        });
        return;
      }

      adminNamespace.emit(
        "technicianOnline",
        buildAdminTechnicianPayload(technician)
      );
    } catch (err) {
      console.error("Error emitting admin technician presence:", err);
    }
  }

  // Admin namespace handlers
  adminNamespace.on("connection", (socket) => {
    console.log("Admin connected:", socket.id);

    socket.on("register", () => {
      const adminId = String(socket.user.id);
      adminSockets.set(adminId, socket.id);
      socket.adminId = adminId;
      console.log(`Admin ${adminId} registered with socket ${socket.id}`);
    });

    // Admin claims SOS (Create Job) — first claim wins
    socket.on("sosAccepted", async (data) => {
      try {
        const { sos_id, customer_id } = data;
        const adminId = socket.user?.id;
        console.log(`Admin ${adminId} claiming SOS ${sos_id}`);

        const sos = await SOSRequest.findById(sos_id);
        if (!sos || !["pending", "in_call"].includes(sos.status)) {
          socket.emit("error", {
            message: "SOS is no longer available",
            code: "SOS_UNAVAILABLE",
            sos_id,
          });
          return;
        }

        if (
          sos.claimed_by &&
          String(sos.claimed_by) !== String(adminId)
        ) {
          socket.emit("error", {
            message: "SOS already claimed by another dispatcher",
            code: "SOS_ALREADY_CLAIMED",
            sos_id,
            claimed_by: sos.claimed_by.toString(),
          });
          adminNamespace.emit("sosClaimed", {
            sos_id: sos._id.toString(),
            admin_id: sos.claimed_by.toString(),
            customer_id: String(sos.customer_id),
          });
          return;
        }

        const now = new Date();
        sos.status = "in_call";
        sos.in_call_at = sos.in_call_at || now;
        sos.claimed_by = adminId;
        sos.claimed_at = sos.claimed_at || now;
        await sos.save();
        clearSosTimers(sos._id);
        scheduleInCallExpiry(sos);

        adminNamespace.emit("sosClaimed", {
          sos_id: sos._id.toString(),
          admin_id: String(adminId),
          customer_id: String(sos.customer_id),
        });

        const customerSocketId = customerSockets.get(
          String(customer_id || sos.customer_id)
        );
        if (customerSocketId) {
          customerNamespace.to(customerSocketId).emit("sosInCall", {
            sos_id: sos._id.toString(),
            status: "in_call",
            message:
              "An operator is reviewing your request and will call you shortly",
          });
        }
      } catch (err) {
        console.error("Error handling sosAccepted:", err);
        socket.emit("error", { message: "Failed to claim SOS" });
      }
    });

    // Admin cancels job mid-job
    socket.on("adminCancelJob", async (data) => {
      try {
        const { job_id, customer_id, technician_id, reason } = data;
        console.log(`Admin cancelling job ${job_id}`);

        // Get job first to find linked SOS
        const jobBefore = await Job.findById(job_id);
        
        // Update job status to cancelled
        const job = await Job.findByIdAndUpdate(job_id, {
          job_status: 'cancelled',
          cancelled_at: new Date(),
          cancellation_reason: reason || 'Cancelled by admin'
        }, { new: true });

        if (!job) {
          socket.emit("error", { message: "Job not found" });
          return;
        }

        // Cancel the linked SOS request if exists
        if (jobBefore && jobBefore.sos_request_id) {
          await SOSRequest.findByIdAndUpdate(jobBefore.sos_request_id, {
            status: 'cancelled'
          });
          console.log(`SOS ${jobBefore.sos_request_id} cancelled due to job cancellation`);
        }

        // Update technician status back to "Online" if assigned
        const techId =
          technician_id ||
          job.assignedTechnician?.toString?.() ||
          job.assignedTechnician;
        if (techId) {
          await setTechnicianStatus(techId, "Online");
          await emitAdminTechnicianPresence(techId, "Online");
          console.log(`Technician ${techId} status reset to Online`);
        }

        const cancellationData = {
          job_id,
          status: "cancelled",
          reason: reason || 'Cancelled by admin',
          cancelled_at: new Date()
        };

        // Notify customer
        if (customer_id) {
          const customerSocketId = customerSockets.get(customer_id.toString());
          if (customerSocketId) {
            customerNamespace.to(customerSocketId).emit("jobCancelled", cancellationData);
            console.log(`Customer ${customer_id} notified: job cancelled`);
          }
        }

        // Notify technician
        if (technician_id) {
          const technicianSocketId = technicianSockets.get(technician_id.toString());
          if (technicianSocketId) {
            technicianNamespace.to(technicianSocketId).emit("jobCancelled", cancellationData);
            console.log(`Technician ${technician_id} notified: job cancelled`);
          }
        }

        // Confirm to admin
        socket.emit("jobCancelled", {
          ...cancellationData,
          message: "Job cancelled successfully"
        });

        console.log(`Job ${job_id} cancelled by admin`);
      } catch (err) {
        console.error("Error cancelling job:", err);
        socket.emit("error", { message: "Failed to cancel job" });
      }
    });

    socket.on("disconnect", () => {
      if (socket.adminId) {
        adminSockets.delete(socket.adminId);
        console.log(`Admin ${socket.adminId} disconnected`);
      }
    });
  });

  // Customer namespace handlers
  customerNamespace.on("connection", (socket) => {
    console.log("Customer connected:", socket.id);

    // Customer registers their ID (from JWT — ignore client-supplied id)
    socket.on("register", () => {
      const customerId = String(socket.user.id);
      customerSockets.set(customerId, socket.id);
      socket.customerId = customerId;
      console.log(`Customer ${customerId} registered with socket ${socket.id}`);
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

        console.log("Received createSOS:", {
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
          if (!vehicle) {
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

        console.log(`Broadcasting SOS ${sos._id} to ${adminSockets.size} admin(s)`);
        adminNamespace.emit('newSOSRequest', sosData);

      } catch (err) {
        console.error("Error creating SOS:", err);
        socket.emit("error", { message: "Failed to create SOS request", details: err.message });
      }
    });

    // Customer cancels SOS
    socket.on("cancelSOS", async (data) => {
      try {
        const { sos_id, reason } = data;
        const sos = await SOSRequest.findById(sos_id);

        if (sos && ["pending", "in_call"].includes(sos.status) && !sos.job_id) {
          sos.status = "cancelled";
          sos.cancel_reason = reason;
          await sos.save();
          clearSosTimers(sos._id);

          socket.emit("sosCancelled", { sos_id, status: "cancelled" });
          adminNamespace.emit("sosCancelled", {
            sos_id: sos._id.toString(),
            customer_id: String(sos.customer_id),
          });
        }
      } catch (err) {
        console.error("Error cancelling SOS:", err);
        socket.emit("error", { message: "Failed to cancel SOS", details: err.message });
      }
    });

    socket.on("disconnect", () => {
      if (socket.customerId) {
        customerSockets.delete(socket.customerId);
        console.log(`Customer ${socket.customerId} disconnected`);
      }
    });
  });

  // Technician namespace handlers
  technicianNamespace.on("connection", (socket) => {
    console.log("Technician connected:", socket.id);

    // Technician registers their ID (from JWT — ignore client-supplied id)
    socket.on("register", () => {
      const technicianId = String(socket.user.id);
      // Cancel pending offline mark from a brief disconnect
      if (technicianOfflineTimers.has(technicianId)) {
        clearTimeout(technicianOfflineTimers.get(technicianId));
        technicianOfflineTimers.delete(technicianId);
      }
      technicianSockets.set(technicianId, socket.id);
      socket.technicianId = technicianId;
      console.log(`Technician ${technicianId} registered with socket ${socket.id}`);
    });

    // Technician updates location (throttle writes ~3s per socket)
    const locationThrottleMs = Number(process.env.LOCATION_THROTTLE_MS || 3000);
    socket.on("updateLocation", async (data) => {
      try {
        const now = Date.now();
        if (socket._lastLocationWrite && now - socket._lastLocationWrite < locationThrottleMs) {
          return;
        }
        socket._lastLocationWrite = now;

        const technician_id = String(socket.user.id);
        const { latitude, longitude, job_id } = data;
        if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
          return;
        }

        const lastLocationAt = new Date();
        await Technician.findByIdAndUpdate(technician_id, {
          "currentLocation.coordinates": [longitude, latitude],
          lastLocationAt,
        });

        // Broadcast to all admin Live Map clients (with timestamp for freshness check)
        emitAdminTechnicianLocation(technician_id, latitude, longitude, lastLocationAt);

        // If there's an active job, broadcast location to customer
        if (job_id) {
          const job = await Job.findById(job_id);
          if (
            job &&
            assertSocketJobAccess(job, socket) &&
            job.customer_id
          ) {
            const customerSocketId = customerSockets.get(job.customer_id.toString());
            if (customerSocketId) {
              customerNamespace.to(customerSocketId).emit("locationUpdate", {
                job_id,
                latitude,
                longitude,
                timestamp: new Date()
              });
            }
          }
        }

        console.log(
          process.env.NODE_ENV === "development"
            ? `Technician ${technician_id} location updated: [${latitude}, ${longitude}]`
            : `Technician ${technician_id} location updated`
        );
      } catch (err) {
        console.error("Error updating technician location:", err);
      }
    });

    // Technician starts en route to customer (assigned → en_route)
    socket.on("startEnRoute", async (data) => {
      try {
        const { job_id } = data;
        console.log(`Technician starting en route for job ${job_id}`);

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
        const customerSocketId = customerSockets.get(job.customer_id?.toString());
        if (customerSocketId) {
          customerNamespace.to(customerSocketId).emit("technicianEnRoute", {
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
          console.log(`Customer ${job.customer_id} notified: technician en route`);
        }
      } catch (err) {
        console.error("Error starting en route:", err);
        socket.emit("error", { message: "Failed to start en route" });
      }
    });

    // ⚡ Technician marks as arrived (en_route → arrived)
    socket.on("markArrived", async (data) => {
      try {
        const { job_id } = data;
        console.log(`Technician marking arrived for job ${job_id}`);

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
        const customerSocketId = customerSockets.get(job.customer_id?.toString());
        if (customerSocketId) {
          customerNamespace.to(customerSocketId).emit("technicianArrived", {
            job_id,
            status: "arrived",
            arrived_at: job.arrived_at
          });
          console.log(`Customer ${job.customer_id} notified: technician arrived`);
        }
      } catch (err) {
        console.error("Error marking arrived:", err);
        socket.emit("error", { message: "Failed to mark as arrived" });
      }
    });

    // ⚡ Technician starts job (arrived → in_progress)
    // Prefer REST POST /api/jobs/:id/start — this handler mirrors the same gates.
    socket.on("startJob", async (data) => {
      try {
        const { job_id, latitude, longitude, lat, lng } = data || {};
        console.log(`Technician starting job ${job_id}`);

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

        const otherInProgress = await Job.findOne({
          assignedTechnician: socket.user.id,
          job_status: "in_progress",
          _id: { $ne: job._id },
        }).select("_id");
        if (otherInProgress) {
          socket.emit("error", {
            message: "Finish your current in-progress job before starting another",
          });
          return;
        }

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
        const customerSocketId = customerSockets.get(job.customer_id?.toString());
        if (customerSocketId) {
          customerNamespace.to(customerSocketId).emit("jobStarted", {
            job_id,
            status: "in_progress",
            started_at: job.started_at
          });
          console.log(`Customer ${job.customer_id} notified: job started`);
        }
      } catch (err) {
        console.error("Error starting job:", err);
        socket.emit("error", { message: "Failed to start job" });
      }
    });

    // ⚡ Technician confirms payment received (completed → paid)
    // REST confirmPayment is source of truth for payment + receipt; this handler
    // is notify-only when payment_status is already paid.
    socket.on("paymentReceived", async (data) => {
      try {
        const { job_id, payment_method } = data;
        console.log(`Technician confirming payment for job ${job_id}`);

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

        if (job.job_status !== "completed") {
          socket.emit("error", {
            message: `Cannot mark payment from status: ${job.job_status}. Job must be marked complete first.`,
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

        const notifyCustomerPaid = (receiptData) => {
          const customerSocketId = customerSockets.get(
            job.customer_id?._id?.toString()
          );
          if (customerSocketId) {
            customerNamespace.to(customerSocketId).emit("jobCompleted", {
              job_id,
              job_status: "completed",
              payment_status: "paid",
              total_amount: job.price,
              receipt: receiptData,
              technician: job.assignedTechnician
                ? {
                    name: `${job.assignedTechnician.firstName} ${job.assignedTechnician.lastName}`,
                    photo: job.assignedTechnician.profilePicture,
                  }
                : null,
            });
            console.log(`Customer ${job.customer_id._id} notified: job completed & paid`);
          }
        };

        // Idempotent notify-only path after REST confirmPayment
        if (job.payment_status === "paid") {
          await setTechnicianStatus(job.assignedTechnician._id, "Online");
          await emitAdminTechnicianPresence(job.assignedTechnician._id, "Online");
          const receiptData = buildReceiptData();
          socket.emit("paymentConfirmed", {
            job_id,
            job_status: "completed",
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

        await setTechnicianStatus(job.assignedTechnician._id, "Online");
        await emitAdminTechnicianPresence(job.assignedTechnician._id, "Online");

        const receiptData = buildReceiptData();
        receiptData.payment_method = job.payment_method;
        receiptData.paid_at = job.paid_at;

        socket.emit("paymentConfirmed", {
          job_id,
          job_status: "completed",
          payment_status: "paid",
          receipt: receiptData,
          message: "Payment confirmed successfully",
        });

        notifyCustomerPaid(receiptData);
      } catch (err) {
        console.error("Error confirming payment:", err);
        socket.emit("error", { message: "Failed to confirm payment" });
      }
    });

    socket.on("disconnect", () => {
      if (socket.technicianId) {
        const technicianId = socket.technicianId;
        // Only clear if this socket is still the mapped one (reconnect may have replaced it)
        if (technicianSockets.get(technicianId) === socket.id) {
          technicianSockets.delete(technicianId);
        }
        console.log(`Technician ${technicianId} disconnected`);

        // Grace window: if the tech reconnects quickly (or their REST heartbeats keep arriving)
        // we don't want to flip them Offline. Check lastLocationAt before acting.
        if (technicianOfflineTimers.has(technicianId)) {
          clearTimeout(technicianOfflineTimers.get(technicianId));
        }
        const timer = setTimeout(async () => {
          technicianOfflineTimers.delete(technicianId);
          // If the tech reconnected via socket, leave them alone.
          if (technicianSockets.has(technicianId)) return;
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
              console.log(`Technician ${technicianId} socket gone but REST heartbeat fresh (${Math.round(locationAge / 1000)}s ago) — keeping Online`);
              // Schedule a follow-up check after stale window expires.
              const followUp = setTimeout(async () => {
                technicianOfflineTimers.delete(technicianId);
                if (technicianSockets.has(technicianId)) return;
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
                  await setTechnicianStatus(t2, "Offline");
                  await emitAdminTechnicianPresence(technicianId, "Offline");
                  console.log(`Technician ${technicianId} marked Offline after heartbeat stale`);
                } catch (err) {
                  console.error("Failed to mark technician Offline on follow-up:", err);
                }
              }, LOCATION_STALE_MS);
              followUp.unref?.();
              technicianOfflineTimers.set(technicianId, followUp);
              return;
            }
            // No fresh heartbeat — app is gone (force-quit / crash). Mark Offline now.
            await setTechnicianStatus(tech, "Offline");
            await emitAdminTechnicianPresence(technicianId, "Offline");
            console.log(`Technician ${technicianId} marked Offline after disconnect grace (no heartbeat)`);
          } catch (err) {
            console.error("Failed to mark technician Offline after disconnect:", err);
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
      console.log(`notifyAssignedTechnician called with jobId: ${jobId}`);
      
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
        console.log('Job not found:', jobId);
        return false;
      }

      if (!job.assignedTechnician) {
        console.log('No technician assigned to job:', jobId);
        return false;
      }

      const technicianId = job.assignedTechnician._id.toString();
      console.log(`Looking for technician ${technicianId} in connected sockets...`);
      console.log(`Connected technicians: ${Array.from(technicianSockets.keys()).join(', ')}`);

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
      
      const socketId = technicianSockets.get(technicianId);
      let socketOk = false;
      
      if (socketId) {
        technicianNamespace.to(socketId).emit("newJobAssigned", jobData);
        console.log(`✅ Technician ${technicianId} notified via socket ${socketId}`);
        console.log('Job data sent:', JSON.stringify(jobData, null, 2));
        socketOk = true;
      } else {
        console.log(`❌ Technician ${technicianId} is not connected (socket not found)`);
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
      return false;
    }
  }

  // Notify customer that technician was assigned
  async function notifyCustomerTechnicianAssigned(customerId, data) {
    try {
      console.log(`Notifying customer ${customerId} of technician assignment`);
      const socketId = customerSockets.get(customerId.toString());
      
      if (socketId) {
        customerNamespace.to(socketId).emit("technicianAssigned", data);
        console.log(`Customer ${customerId} notified via socket ${socketId}`);
        return true;
      } else {
        console.log(`Customer ${customerId} is not connected`);
        return false;
      }
    } catch (error) {
      console.error("Error notifying customer:", error);
      return false;
    }
  }

  // Notify customer of technician acceptance
  async function notifyCustomerTechnicianAccepted(customerId, data) {
    try {
      console.log(`Notifying customer ${customerId} of technician acceptance`);
      const socketId = customerSockets.get(customerId.toString());
      
      if (socketId) {
        customerNamespace.to(socketId).emit("technicianAccepted", data);
        console.log(`Customer ${customerId} notified of acceptance via socket ${socketId}`);
        return true;
      } else {
        console.log(`Customer ${customerId} is not connected`);
        return false;
      }
    } catch (error) {
      console.error("Error notifying customer of acceptance:", error);
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

    const customerSocketId = customerSockets.get(
      String(customer_id || sos.customer_id)
    );
    if (customerSocketId) {
      customerNamespace.to(customerSocketId).emit("sosInCall", {
        sos_id: String(sos_id),
        status: "in_call",
        message:
          "An operator is reviewing your request and will call you shortly",
      });
    }
    return true;
  }

  /** Notify customer of fulfill-path status from REST controllers */
  async function notifyCustomerJobEvent(customerId, event, data) {
    try {
      const socketId = customerSockets.get(String(customerId));
      if (!socketId) return false;
      customerNamespace.to(socketId).emit(event, data);
      return true;
    } catch (error) {
      console.error(`Error emitting ${event} to customer:`, error);
      return false;
    }
  }

  /** Business portal → admin: same urgency surface as SOS, with business tag. */
  function notifyAdminBusinessJob(payload) {
    try {
      console.log(
        `Broadcasting business job ${payload?.job_id} to ${adminSockets.size} admin(s)`
      );
      adminNamespace.emit("newBusinessJob", payload);
      return true;
    } catch (error) {
      console.error("Error emitting newBusinessJob to admin:", error);
      return false;
    }
  }

  /** Technician-app created job → admin intake badge. */
  function notifyAdminTechnicianJob(payload) {
    try {
      console.log(
        `Broadcasting technician job ${payload?.job_id} to ${adminSockets.size} admin(s)`
      );
      adminNamespace.emit("newTechnicianJob", payload);
      return true;
    } catch (error) {
      console.error("Error emitting newTechnicianJob to admin:", error);
      return false;
    }
  }

  function notifyAdminServiceRequest(payload) {
    try {
      console.log(
        `Broadcasting service request ${payload?.id || payload?._id} to ${adminSockets.size} admin(s)`
      );
      adminNamespace.emit("newServiceRequest", payload);
      return true;
    } catch (error) {
      console.error("Error emitting newServiceRequest to admin:", error);
      return false;
    }
  }

  function notifyAdminServiceRequestCancelled(payload) {
    try {
      adminNamespace.emit("serviceRequestCancelled", payload);
      return true;
    } catch (error) {
      console.error("Error emitting serviceRequestCancelled to admin:", error);
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
    notifyAdminBusinessJob,
    notifyAdminTechnicianJob,
    notifyAdminServiceRequest,
    notifyAdminServiceRequestCancelled,
    customerSockets,
    technicianSockets,
    adminSockets
  };
}

module.exports = { initializeSOSSocket };
