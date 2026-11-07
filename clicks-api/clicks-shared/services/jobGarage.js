const { putJobOnHold, holdError } = require("./jobHold");

function garageError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseExpectedReadyAt(value) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw garageError("Invalid expected_ready_at");
  }
  return d;
}

async function sendJobToGarage(
  job,
  { reason, garageName, expectedReadyAt, heldBy } = {}
) {
  if (!job) throw garageError("Job not found", 404);
  const garageReason = String(reason ?? "").trim();
  if (!garageReason) throw garageError("Garage reason is required");

  job.garage = {
    phase: "at_garage",
    name: String(garageName || "").trim(),
    reason: garageReason,
    expected_ready_at: parseExpectedReadyAt(expectedReadyAt),
    sent_at: new Date(),
    ready_at: null,
  };

  await putJobOnHold(job, {
    reason: garageReason,
    scheduledReturnAt: expectedReadyAt,
    heldBy,
  });
  return job;
}

async function markGarageReady(job) {
  if (!job) throw garageError("Job not found", 404);
  if (job.garage?.phase !== "at_garage") {
    throw garageError("Job is not at the garage");
  }
  if (!job.garage) job.garage = {};
  job.garage.phase = "returning";
  job.garage.ready_at = new Date();
  job.job_status = "accepted";
  job.resumed_at = new Date();
  await job.save();
  return job;
}

/**
 * Customer payload for jobAtGarage / jobGarageReady (scenario 52). The
 * garage timestamps are the notifyCustomer dedupe keys.
 * @param {"at_garage"|"returning"} phase
 */
function garageCustomerPayload(job, phase) {
  const garage = job.garage || {};
  return {
    job_id: String(job._id),
    sos_id: job.sos_request_id ? String(job.sos_request_id) : undefined,
    job_status: job.job_status,
    status: job.job_status,
    garage: {
      phase: garage.phase || phase,
      name: garage.name || "",
      expected_ready_at: garage.expected_ready_at || null,
      sent_at: garage.sent_at || null,
      ready_at: garage.ready_at || null,
    },
    garage_name: garage.name || "",
    ...(phase === "at_garage"
      ? { garage_sent_at: garage.sent_at || new Date() }
      : { garage_ready_at: garage.ready_at || new Date() }),
  };
}

function assertCanResume(job) {
  if (job?.garage?.phase === "at_garage") {
    throw holdError("Use garage ready before resuming this job");
  }
}

module.exports = {
  sendJobToGarage,
  markGarageReady,
  assertCanResume,
  garageError,
  garageCustomerPayload,
};
