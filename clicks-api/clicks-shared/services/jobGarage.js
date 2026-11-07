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
};
