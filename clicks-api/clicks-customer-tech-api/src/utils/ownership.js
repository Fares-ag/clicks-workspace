function sameId(a, b) {
  if (a == null || b == null) return false;
  const idA = a._id != null ? a._id : a;
  const idB = b._id != null ? b._id : b;
  return String(idA) === String(idB);
}

/** Ensure the authenticated user can access this job. */
function assertJobAccess(job, user) {
  if (!job || !user) return false;
  if (user.role === "customer") {
    return sameId(job.customer_id, user.id);
  }
  if (user.role === "technician") {
    return sameId(job.assignedTechnician, user.id);
  }
  return false;
}

function assertVehicleOwner(vehicle, user) {
  if (!vehicle || !user) return false;
  if (user.role !== "customer") return false;
  return sameId(vehicle.customer_id, user.id);
}

function assertSosAccess(sos, user) {
  if (!sos || !user) return false;
  if (user.role === "customer") return sameId(sos.customer_id, user.id);
  if (user.role === "technician") {
    return sameId(sos.assigned_technician, user.id);
  }
  return false;
}

module.exports = {
  sameId,
  assertJobAccess,
  assertVehicleOwner,
  assertSosAccess,
};
