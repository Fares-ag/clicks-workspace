/**
 * NoSQL operator sanitiser.  NEW FILE.
 *
 * Fixes P0-1 (unauthenticated account takeover via `{"otp": {"$gt": ""}}`).
 *
 * Why not `express-mongo-sanitize`?  It works on Express 4, but it mutates
 * `req.query` in place, which breaks on Express 5, and it is unmaintained.
 * This is 40 lines, has no dependencies, and does exactly one thing.
 *
 * This is DEFENCE IN DEPTH, not the primary fix.  The primary fix is
 * coercing each input at the handler with `utils/coerce.js`.  Ship both:
 * this catches the endpoints you forget.
 *
 * Wire it up in BOTH `src/index.js` files, immediately after
 * `app.use(express.json())` and BEFORE any route is mounted:
 *
 *     const { sanitizeRequest } = require("../../clicks-shared/middleware/sanitize");
 *     app.use(express.json());
 *     app.use(sanitizeRequest());          // <-- add this line
 */

const DEFAULT_MAX_DEPTH = 12;

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Recursively strip keys that Mongo would interpret as operators.
 * Returns { value, removed: [paths] } so the caller can log/alert.
 */
function scrub(value, opts, depth, path, removed) {
  if (depth > opts.maxDepth) return undefined;

  if (Array.isArray(value)) {
    return value.map((v, i) =>
      scrub(v, opts, depth + 1, `${path}[${i}]`, removed)
    );
  }

  if (!isPlainObject(value)) return value;

  const out = {};
  for (const key of Object.keys(value)) {
    // `$gt`, `$ne`, `$where`, `$regex`, … — anything Mongo treats as an operator.
    // Dotted keys let an attacker reach into nested paths on an update.
    // `__proto__` / `constructor` / `prototype` are prototype-pollution vectors
    // (also relevant to the xlsx import path).
    if (
      key.startsWith("$") ||
      key.includes(".") ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype"
    ) {
      removed.push(path ? `${path}.${key}` : key);
      continue;
    }
    out[key] = scrub(value[key], opts, depth + 1, path ? `${path}.${key}` : key, removed);
  }
  return out;
}

/**
 * @param {object}  [options]
 * @param {number}  [options.maxDepth=12]  Guard against deeply nested payload DoS.
 * @param {boolean} [options.reject=false] true  -> 400 when an operator is found.
 *                                          false -> strip silently and continue.
 *   Start with reject:false so a false positive cannot take the app down.
 *   Once the logs are clean for a week, flip to reject:true.
 */
function sanitizeRequest(options = {}) {
  const opts = {
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    reject: options.reject ?? false,
  };

  return function sanitizeRequestMiddleware(req, res, next) {
    const removed = [];

    if (req.body !== undefined) req.body = scrub(req.body, opts, 0, "body", removed);
    if (req.params !== undefined) req.params = scrub(req.params, opts, 0, "params", removed);

    // Express 5 makes req.query a getter — assigning to it throws.
    // Rebuild in place instead so this file works on both 4 and 5.
    if (req.query !== undefined) {
      const cleanQuery = scrub(req.query, opts, 0, "query", removed);
      for (const k of Object.keys(req.query)) delete req.query[k];
      Object.assign(req.query, cleanQuery);
    }

    if (removed.length) {
      // This is a security event, not a debug line. It means someone sent an
      // operator to an endpoint that should never receive one. Alert on it.
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "nosql_operator_stripped",
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
          fields: removed.slice(0, 20),
        })
      );
      if (opts.reject) {
        return res.status(400).json({ error: "Malformed request payload" });
      }
    }

    next();
  };
}

module.exports = { sanitizeRequest, scrub };
