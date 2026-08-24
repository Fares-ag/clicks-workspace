/**
 * Day boundaries in Asia/Qatar, which is a fixed UTC+3 with no DST — so a plain
 * offset is exact and needs no tz database.
 *
 * Date#setHours() is server-local, and the API containers set no TZ (they run
 * UTC), so it bucketed every job completed between 00:00 and 03:00 Qatar into
 * the previous day. These helpers are independent of the container's TZ.
 */
const QATAR_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Start of the Qatar-local day containing `d`, as an absolute (UTC) Date. */
function startOfQatarDay(d = new Date()) {
  const shifted = new Date(new Date(d).getTime() + QATAR_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - QATAR_OFFSET_MS);
}

/** End of the Qatar-local day containing `d` (inclusive, ms precision). */
function endOfQatarDay(d = new Date()) {
  const shifted = new Date(new Date(d).getTime() + QATAR_OFFSET_MS);
  shifted.setUTCHours(23, 59, 59, 999);
  return new Date(shifted.getTime() - QATAR_OFFSET_MS);
}

module.exports = { QATAR_OFFSET_MS, startOfQatarDay, endOfQatarDay };
