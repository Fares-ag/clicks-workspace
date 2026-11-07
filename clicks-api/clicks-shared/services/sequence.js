const Counter = require("../models/Counter");

const QATAR_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

function qatarYear(date = new Date()) {
  return new Date(new Date(date).getTime() + QATAR_UTC_OFFSET_MS).getUTCFullYear();
}

/**
 * Atomically take the next value of a named counter. Inside a transaction the
 * increment rolls back with it, so numbering has no gaps from aborted work.
 * @param {string} name
 * @param {{ session?: import("mongoose").ClientSession | null }} [options]
 */
async function nextSequence(name, { session = null } = {}) {
  const opts = { new: true, upsert: true, setDefaultsOnInsert: true };
  if (session) opts.session = session;
  const doc = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, opts);
  return doc.seq;
}

function formatNumbered(prefix, year, seq) {
  return `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
}

/** REC-2026-000001 — one series per Qatar calendar year. */
async function nextReceiptNumber({ session = null, at = new Date() } = {}) {
  const year = qatarYear(at);
  const seq = await nextSequence(`receipt:${year}`, { session });
  return formatNumbered("REC", year, seq);
}

/** CN-2026-000001 — credit notes issued against receipts. */
async function nextCreditNoteNumber({ session = null, at = new Date() } = {}) {
  const year = qatarYear(at);
  const seq = await nextSequence(`credit_note:${year}`, { session });
  return formatNumbered("CN", year, seq);
}

module.exports = {
  nextSequence,
  nextReceiptNumber,
  nextCreditNoteNumber,
  qatarYear,
  formatNumbered,
};
