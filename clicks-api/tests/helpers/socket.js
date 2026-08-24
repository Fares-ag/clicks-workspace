const { io: ioClient } = require("socket.io-client");

/**
 * Wait for a single socket.io event (rejects on timeout).
 * @param {import('socket.io-client').Socket} socket
 * @param {string} event
 * @param {number} [ms=15000]
 */
function waitForEvent(socket, event, ms = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for "${event}" after ${ms}ms`));
    }, ms);

    function handler(payload) {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }

    socket.once(event, handler);
  });
}

/**
 * Assert no event arrives within [ms] (resolves if quiet, rejects if fired).
 */
function expectNoEvent(socket, event, ms = 2000) {
  return new Promise((resolve, reject) => {
    function handler(payload) {
      clearTimeout(timer);
      socket.off(event, handler);
      reject(
        new Error(`Unexpected "${event}": ${JSON.stringify(payload)}`)
      );
    }

    socket.on(event, handler);
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
  });
}

/**
 * Connect to a namespace and resolve when the socket is connected.
 */
function connectSocket({ baseUrl, namespace, token }) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`${baseUrl}${namespace}`, {
      transports: ["websocket"],
      auth: token != null ? { token } : {},
      forceNew: true,
      reconnection: false,
    });

    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err) => {
      socket.disconnect();
      reject(err);
    });
  });
}

function listenServer(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ port, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function closeServer(server) {
  if (!server || !server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function disconnectAll(sockets) {
  for (const socket of sockets) {
    if (socket?.connected) socket.disconnect();
    else socket?.disconnect?.();
  }
}

module.exports = {
  waitForEvent,
  expectNoEvent,
  connectSocket,
  listenServer,
  closeServer,
  disconnectAll,
};
