/**
 * Opt-in Socket.IO Redis adapter for multi-instance fanout.
 * Enabled only when REDIS_URL is set. Soft launch / local: leave unset (memory adapter).
 *
 * Note: in-memory technician/customer socket id maps in sosSocketService still need
 * sticky sessions (nginx ip_hash) across nodes, or a later shared presence store.
 * The Redis adapter propagates emits across processes; it does not replace those maps.
 */
async function attachSocketAdapter(io) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl || !String(redisUrl).trim()) {
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

  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));

  console.log(
    JSON.stringify({
      level: "info",
      msg: "socket_adapter",
      adapter: "redis",
    })
  );

  return { adapter: "redis", pubClient, subClient };
}

module.exports = { attachSocketAdapter };
