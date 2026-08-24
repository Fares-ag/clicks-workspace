/** Fields returned by tech-api paginated job history lists (Flutter list UIs). */
const MOBILE_JOB_LIST_SELECT =
  "_id job_reference clientName clientMobileNumber issue location dateTime jobType job_status price payment_status payment_method rating rejection_reasons started_at completed_at businessName businessCutType businessCutPercent vehicleMake vehicleModel vehicleYear licensePlate createdAt assignedTechnician customer_vehicle_id";

const MOBILE_JOB_LIST_POPULATE = [
  {
    path: "assignedTechnician",
    select: "firstName lastName phone profilePicture",
  },
  {
    path: "customer_vehicle_id",
    select: "year plate_number",
    populate: [
      { path: "vehicle_make", select: "makeName" },
      { path: "vehicle_model", select: "modelName" },
    ],
  },
];

function paginateQuery(pageRaw, limitRaw) {
  const { num } = require("./coerce");
  const page = Math.max(1, num(pageRaw, { min: 1, integer: true }) || 1);
  const limit = Math.min(50, Math.max(1, num(limitRaw, { min: 1, integer: true }) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

module.exports = {
  MOBILE_JOB_LIST_SELECT,
  MOBILE_JOB_LIST_POPULATE,
  paginateQuery,
};
