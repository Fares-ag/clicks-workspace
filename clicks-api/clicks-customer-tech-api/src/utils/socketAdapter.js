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
 */
let adapterState = { adapter: "memory", pubClient: null };

/** Bounded wait for the Redis handshake at boot. */
const ADAPTER_CONNECT_TIMEOUT_MS = Number(
  process.env.REDIS_CONNECT_TIMEOUT_MS || 10000
);

function getSocketAdapterType() {
  return process.env.REDIS_URL && String(process.env.REDIS_URL).trim() ? "redis" : "memory";
}

async function pingRedis(timeoutMs = 1000) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || !String(redisUrl).trim()) return;

  const client = adapterState.pubClient;
  if (!client) {
    throw new Error("redis client not initialized");
  }

  await Promise.race([
    client.ping(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("redis ping timeout")), timeoutMs)
    ),
  ]);
}

async function attachSocketAdapter(io) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || !String(redisUrl).trim()) {
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
  const { createClient } = require("redis");

  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();

  pubClient.on("error", (err) => {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "redis_pub_error",
        error: err.message,
      })
    );
  });
  subClient.on("error", (err) => {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "redis_sub_error",
        error: err.message,
      })
    );
  });

  // node-redis retries internally, so an unreachable host leaves connect()
  // pending indefinitely. Awaiting it bare meant the process never listened,
  // never crashed and never reported — it just looked deployed. Fail loudly
  // instead: REDIS_URL being set means multi-instance, and silently degrading
  // to the memory adapter would split presence across instances.
  await Promise.race([
    Promise.all([pubClient.connect(), subClient.connect()]),
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `redis adapter connect timed out after ${ADAPTER_CONNECT_TIMEOUT_MS}ms`
            )
          ),
        ADAPTER_CONNECT_TIMEOUT_MS
      )
    ),
  ]);
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
