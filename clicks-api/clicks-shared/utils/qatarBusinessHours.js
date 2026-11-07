/**
 * Qatar clock helpers. SOS stays 24/7 — after_hours is a stamp for dispatch,
 * not a kill switch.
 */
const QATAR_OFFSET_MS = 3 * 60 * 60 * 1000;
const OPEN_MINUTE = 6 * 60;
const CLOSE_MINUTE = 22 * 60;

function qatarWall(date = new Date()) {
  return new Date(date.getTime() + QATAR_OFFSET_MS);
}

function qatarMinutes(date = new Date()) {
  const shifted = qatarWall(date);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

function isOpenAt(date = new Date()) {
  const minutes = qatarMinutes(date);
  return minutes >= OPEN_MINUTE && minutes < CLOSE_MINUTE;
}

function nextOpenAt(date = new Date()) {
  if (isOpenAt(date)) return null;
  const shifted = qatarWall(date);
  const dayStartUtc =
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) -
    QATAR_OFFSET_MS;
  let open = dayStartUtc + OPEN_MINUTE * 60 * 1000;
  if (qatarMinutes(date) >= CLOSE_MINUTE) {
    open += 24 * 60 * 60 * 1000;
  }
  return new Date(open);
}

function stampBusinessHours(date = new Date()) {
  const afterHours = !isOpenAt(date);
  return {
    after_hours: afterHours,
    next_open_at: afterHours ? nextOpenAt(date) : null,
  };
}

module.exports = {
  QATAR_OFFSET_MS,
  OPEN_MINUTE,
  CLOSE_MINUTE,
  qatarMinutes,
  isOpenAt,
  nextOpenAt,
  stampBusinessHours,
};
