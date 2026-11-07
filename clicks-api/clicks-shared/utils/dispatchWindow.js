const { isOpenAt } = require("./qatarBusinessHours");

const MAX_SCHEDULE_DAYS = 60;

function dispatchError(message, code, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function parseScheduledFor(scheduledFor) {
  const when = scheduledFor instanceof Date ? scheduledFor : new Date(scheduledFor);
  if (Number.isNaN(when.getTime())) {
    throw dispatchError(
      "scheduled_for is required for scheduled requests",
      "SCHEDULED_FOR_REQUIRED"
    );
  }
  return when;
}

function assertDispatchWindow(scheduledFor) {
  const when = parseScheduledFor(scheduledFor);
  if (when.getTime() < Date.now() - 60_000) {
    throw dispatchError("scheduled_for must be in the future", "SCHEDULED_FOR_PAST");
  }
  const max = Date.now() + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000;
  if (when.getTime() > max) {
    throw dispatchError(
      "scheduled_for is too far in the future",
      "DISPATCH_WINDOW"
    );
  }
  if (!isOpenAt(when)) {
    throw dispatchError(
      "Scheduled time is outside dispatch hours (06:00–22:00 Qatar)",
      "DISPATCH_WINDOW"
    );
  }
  return when;
}

module.exports = {
  MAX_SCHEDULE_DAYS,
  assertDispatchWindow,
  parseScheduledFor,
};
