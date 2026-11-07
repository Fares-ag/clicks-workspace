/**
 * Merge duplicate Customer rows into one primary (used by the phone and
 * email dedupe scripts).
 *
 * Every collection that points at a customer is re-pointed to the primary;
 * the duplicate is then retired: deactivated, marked deleted with reason
 * `merged_into:<primaryId>`, and its unique fields replaced with tombstones so
 * the unique indexes can be built. Nothing is hard-deleted.
 */
const {
  Customer,
  CustomerVehicle,
  Job,
  SOSRequest,
  ServiceRequest,
  CustomerSubscription,
  ContactUs,
  Notification,
  Receipt,
  SupportTicket,
  Lead,
} = require("../../clicks-shared/models");

const REF_MODELS = [
  CustomerVehicle,
  Job,
  SOSRequest,
  ServiceRequest,
  CustomerSubscription,
  ContactUs,
  Notification,
  Receipt,
  SupportTicket,
  Lead,
];

/** Primary = the row with the most jobs; ties → most recently updated. */
async function choosePrimary(rows) {
  const scored = await Promise.all(
    rows.map(async (row) => ({
      row,
      jobs: await Job.countDocuments({ customer_id: row._id }),
      active: row.status === "Active" && !row.deleted_at ? 1 : 0,
    }))
  );
  scored.sort(
    (a, b) =>
      b.active - a.active ||
      b.jobs - a.jobs ||
      new Date(b.row.updatedAt || 0) - new Date(a.row.updatedAt || 0)
  );
  return scored.map((s) => ({ ...s.row, _jobs: s.jobs }));
}

async function countRefs(customerId) {
  const counts = {};
  for (const Model of REF_MODELS) {
    const n = await Model.countDocuments({ customer_id: customerId });
    if (n) counts[Model.modelName] = n;
  }
  return counts;
}

/**
 * @param {object} primary  lean customer row kept
 * @param {object[]} duplicates lean customer rows retired
 * @param {{apply: boolean}} opts
 */
async function mergeCustomers(primary, duplicates, { apply }) {
  const report = { primary: String(primary._id), merged: [] };
  for (const dup of duplicates) {
    const refs = await countRefs(dup._id);
    report.merged.push({ id: String(dup._id), client_id: dup.client_id, refs });
    if (!apply) continue;
    for (const Model of REF_MODELS) {
      await Model.updateMany({ customer_id: dup._id }, { $set: { customer_id: primary._id } });
    }
    await Customer.updateOne(
      { _id: dup._id },
      {
        $set: {
          status: "Inactive",
          deleted_at: new Date(),
          deleted_reason: `merged_into:${primary._id}`,
          phone_number: `merged:${dup._id}`,
          email: `merged+${dup._id}@merged.invalid`,
          search_phone: "",
        },
        $unset: { fcm_token: 1 },
        $inc: { token_version: 1 },
      }
    );
  }
  return report;
}

module.exports = { REF_MODELS, choosePrimary, mergeCustomers, countRefs };
