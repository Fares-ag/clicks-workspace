/** Thrown inside withTransaction when the in_progress → completed CAS misses. */
const COMPLETION_CAS_MISS = "COMPLETION_CAS_MISS";

function completionCasMissError() {
  const err = new Error(COMPLETION_CAS_MISS);
  err.code = COMPLETION_CAS_MISS;
  return err;
}

function isCompletionCasMiss(err) {
  return err?.code === COMPLETION_CAS_MISS || err?.message === COMPLETION_CAS_MISS;
}

/**
 * True when the deployment cannot run multi-document transactions (standalone Mongo).
 * MongoServerError code 20 (IllegalOperation) and common replica-set wording.
 */
function isReplicaSetTransactionError(err) {
  if (!err) return false;
  const code = err.code;
  if (code === 20 || code === "IllegalOperation") return true;
  const msg = String(err.message || "");
  return (
    msg.includes("Transaction numbers are only allowed on a replica set") ||
    msg.includes("only allowed on a replica set") ||
    msg.includes("no replication enabled")
  );
}

module.exports = {
  COMPLETION_CAS_MISS,
  completionCasMissError,
  isCompletionCasMiss,
  isReplicaSetTransactionError,
};
