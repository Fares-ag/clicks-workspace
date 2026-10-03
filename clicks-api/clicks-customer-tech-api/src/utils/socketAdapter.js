/**
 * Opt-in Socket.IO Redis adapter for multi-instance fanout.
 * Enabled only when REDIS_URL is set. Soft launch / local: leave unset (memory adapter).
 *
 * Note: the adapter propagates EMITS across processes; it does not share state.
 * sosSocketService still keeps per-process state that every instance needs to
 * agree on — technicianOfflineTimers, staleLocationEmittedFor, offlineTechnicians
 * and adminLocationBatch — and userHasLiveSockets() only sees this instance's
 * sockets. Until those move to a shared store, multi-instance deployments still
 * need sticky sessions (nginx ip_hash), or instances will force-Offline each
 * other's reconnecting technicians.
 *
 * Pub/sub clients come from clicks-shared/utils/redisClient.js so cache GET/SET
 * and the adapter share one connection pool (pub is reused; sub is a duplicate).
 */
const {
  isRedisConfigured,
  getRedisClient,
  duplicateRedisClient,
  pingRedis: pingSharedRedis,
} = require("../../../clicks-shared/utils/redisClient");

let adapterState = { adapter: "memory", pubClient: null };

function getSocketAdapterType() {
  return isRedisConfigured() ? "redis" : "memory";
}

async function pingRedis(timeoutMs = 1000) {
  await pingSharedRedis(timeoutMs);
}

async function attachSocketAdapter(io) {
  if (!isRedisConfigured()) {
    adapterState = { adapter: "memory", pubClient: null };
    console.log(
      JSON.stringify({
        level: "info",
        msg: "socket_adapter",
        adapter: "memory",
      })
    );
    return { adapter: "memory" };
  }

  const { createAdapter } = require("@socket.io/redis-adapter");

  // REDIS_URL being set means multi-instance. Fail loudly instead of
  // silently degrading to the memory adapter, which would split presence.
  const pubClient = await getRedisClient({ required: true });
  const subClient = await duplicateRedisClient();

  io.adapter(createAdapter(pubClient, subClient));
  adapterState = { adapter: "redis", pubClient, subClient };

  console.log(
    JSON.stringify({
      level: "info",
      msg: "socket_adapter",
      adapter: "redis",
    })
  );

  return { adapter: "redis", pubClient, subClient };
}

module.exports = { attachSocketAdapter, getSocketAdapterType, pingRedis };
