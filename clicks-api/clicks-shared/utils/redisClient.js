/**
 * Shared Redis client for Clicks APIs.
 *
 * Soft launch: REDIS_URL unset → helpers return null / no-op.
 * Growth: set REDIS_URL and reuse this singleton — never createClient per request.
 *
 * Socket.IO needs a second connection in subscriber mode. Use
 * duplicateRedisClient() for that; do not run GET/SET on the subscriber.
 */
const { durationEnv } = require("./durationEnv");

const CONNECT_RETRY_MS = 15000;

let client = null;
let connecting = null;
let lastConnectErrorAt = 0;
const extraClients = [];
let injectedClient = null;

function isRedisConfigured() {
  const url = process.env.REDIS_URL;
  return Boolean(url && String(url).trim());
}

function getRedisUrl() {
  return isRedisConfigured() ? String(process.env.REDIS_URL).trim() : "";
}

function connectTimeoutMs() {
  return durationEnv("REDIS_CONNECT_TIMEOUT_MS", 10000);
}

function logRedis(level, msg, extra = {}) {
  const line = { level, msg, ...extra };
  if (extra.error instanceof Error) {
    line.error = extra.error.message;
  }
  const payload = JSON.stringify(line);
  if (level === "error") console.error(payload);
  else console.log(payload);
}

function attachErrorHandler(redisClient, msg) {
  redisClient.on("error", (err) => {
    logRedis("error", msg, { error: err });
  });
}

async function connectWithTimeout(redisClient, label) {
  const timeoutMs = connectTimeoutMs();
  let timer;
  try {
    await Promise.race([
      redisClient.connect(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function createConfiguredClient() {
  // Loaded only when REDIS_URL is set so unit/integration tests without Redis
  // installed in the test workspace still boot.
  const { createClient } = require("redis");
  const redisClient = createClient({
    url: getRedisUrl(),
    socket: {
      connectTimeout: connectTimeoutMs(),
      reconnectStrategy(retries) {
        return Math.min(100 * 2 ** retries, 3000);
      },
    },
    pingInterval: 30000,
  });
  attachErrorHandler(redisClient, "redis_client_error");
  return redisClient;
}

/**
 * @param {{ required?: boolean }} [opts]
 * @returns {Promise<import("redis").RedisClientType|null>}
 */
async function getRedisClient({ required = false } = {}) {
  if (injectedClient) return injectedClient;
  if (!isRedisConfigured()) {
    if (required) throw new Error("REDIS_URL is not set");
    return null;
  }
  if (client?.isOpen) return client;
  if (connecting) {
    try {
      return await connecting;
    } catch (err) {
      if (required) throw err;
      return null;
    }
  }
  if (
    !required &&
    lastConnectErrorAt &&
    Date.now() - lastConnectErrorAt < CONNECT_RETRY_MS
  ) {
    return null;
  }

  connecting = (async () => {
    const redisClient = createConfiguredClient();
    try {
      await connectWithTimeout(redisClient, "redis connect");
    } catch (err) {
      try {
        redisClient.disconnect();
      } catch {
        /* connect never finished */
      }
      throw err;
    }
    client = redisClient;
    lastConnectErrorAt = 0;
    logRedis("info", "redis_connected");
    return redisClient;
  })();

  try {
    return await connecting;
  } catch (err) {
    lastConnectErrorAt = Date.now();
    client = null;
    logRedis("error", "redis_connect_failed", { error: err });
    if (required) throw err;
    return null;
  } finally {
    connecting = null;
  }
}

async function duplicateRedisClient() {
  const pub = await getRedisClient({ required: true });
  const sub = pub.duplicate();
  attachErrorHandler(sub, "redis_sub_error");
  await connectWithTimeout(sub, "redis subscriber connect");
  extraClients.push(sub);
  return sub;
}

async function pingRedis(timeoutMs = 1000) {
  const redisClient = await getRedisClient({ required: true });
  if (!redisClient) {
    throw new Error("redis client not initialized");
  }
  let timer;
  try {
    await Promise.race([
      redisClient.ping(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("redis ping timeout")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function closeRedis() {
  const toClose = [...extraClients];
  extraClients.length = 0;
  if (client) toClose.push(client);
  client = null;
  connecting = null;
  lastConnectErrorAt = 0;
  injectedClient = null;

  for (const redisClient of toClose) {
    try {
      if (redisClient.isOpen) await redisClient.quit();
    } catch {
      try {
        redisClient.disconnect();
      } catch {
        /* already closed */
      }
    }
  }
}

/** Test-only: inject a fake client so cache tests do not need a live Redis. */
function setRedisClientForTests(fakeClient) {
  injectedClient = fakeClient;
}

function resetRedisClientForTests() {
  injectedClient = null;
  lastConnectErrorAt = 0;
}

module.exports = {
  isRedisConfigured,
  getRedisUrl,
  getRedisClient,
  duplicateRedisClient,
  pingRedis,
  closeRedis,
  setRedisClientForTests,
  resetRedisClientForTests,
};
