/**
 * Anonymise customers 30 days after self-service deletion (WS-F item 5,
 * scenario 4: "deletion" used to retain all personal data).
 *
 * Name, email, phone, push token and profile picture are replaced with
 * tombstones. Jobs, receipts and memberships are KEPT for accounting; they
 * reference the customer by id only. Once anonymised the phone number is free:
 * re-registering it creates a fresh account. Before anonymisation, the same
 * phone can restore the account via OTP (customerController.register).
 *
 *   CUSTOMER_ANONYMISE_AFTER_DAYS  default 30
 *
 * Idempotent (`anonymized_at` guard), so a second instance running the same
 * sweep is harmless.
 */
const Customer = require("../models/Customer");

const DAY_MS = 24 * 60 * 60 * 1000;

function retentionDays() {
  const n = Number(process.env.CUSTOMER_ANONYMISE_AFTER_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

function tombstone(id) {
  return {
    first_name: "Deleted",
    last_name: "Customer",
    email: `deleted+${id}@deleted.invalid`,
    phone_number: `deleted:${id}`,
    search_name: "deleted customer",
    search_phone: "",
    deleted_reason: "anonymised",
  };
}

/**
 * @param {{ now?: Date, olderThanDays?: number, dryRun?: boolean, limit?: number }} [opts]
 * @returns {Promise<{ candidates: number, anonymised: number, ids: string[] }>}
 */
async function anonymiseDeletedCustomers({
  now = new Date(),
  olderThanDays = retentionDays(),
  dryRun = false,
  limit = 500,
} = {}) {
  const cutoff = new Date(now.getTime() - olderThanDays * DAY_MS);
  const filter = {
    deleted_at: { $ne: null, $lte: cutoff },
    anonymized_at: null,
  };
  const rows = await Customer.find(filter).select("_id").limit(limit).lean();
  const ids = rows.map((r) => String(r._id));
  if (dryRun) return { candidates: ids.length, anonymised: 0, ids };

  let anonymised = 0;
  for (const id of ids) {
    // Conditional on still being deleted-and-not-anonymised: a customer who
    // restored their account a second ago must not be wiped.
    const result = await Customer.updateOne(
      { _id: id, deleted_at: { $ne: null, $lte: cutoff }, anonymized_at: null },
      {
        $set: { ...tombstone(id), anonymized_at: now, status: "Inactive" },
        $unset: { fcm_token: 1, profile_picture: 1, deletion_request: 1 },
        $inc: { token_version: 1 },
      }
    );
    anonymised += result.modifiedCount || 0;
  }
  return { candidates: ids.length, anonymised, ids };
}

/**
 * Daily sweep from the tech API process. unref'd so it never holds the
 * process open; returns a handle for stopCustomerAnonymiser().
 */
function startCustomerAnonymiser({ intervalMs = DAY_MS, firstRunMs = 5 * 60 * 1000 } = {}) {
  const run = () =>
    anonymiseDeletedCustomers()
      .then((r) => {
        if (r.anonymised) {
          console.log(JSON.stringify({ level: "info", msg: "customers_anonymised", count: r.anonymised }));
        }
      })
      .catch((err) => console.error("customer anonymiser failed:", err.message));
  const first = setTimeout(run, firstRunMs);
  first.unref?.();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return { first, timer };
}

function stopCustomerAnonymiser(handle) {
  if (!handle) return;
  clearTimeout(handle.first);
  clearInterval(handle.timer);
}

module.exports = {
  anonymiseDeletedCustomers,
  startCustomerAnonymiser,
  stopCustomerAnonymiser,
  retentionDays,
};
