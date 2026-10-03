/**
 * The one mongoose instance the shared models register on.
 *
 * Every clicks-shared model does a bare `require("mongoose")`, which resolves
 * from THIS directory's module chain (clicks-shared/node_modules -> ancestors ->
 * NODE_PATH, which the Dockerfiles point at the host API's node_modules). A host
 * API doing its own bare `require("mongoose")` resolves from ITS directory
 * instead, and in any tree that still carries a clicks-shared/node_modules/mongoose
 * that is a physically different module object: `mongoose.connect()` then opens a
 * connection no model is bound to, so every query buffers for 10s and fails, and
 * `mongoose.connection.readyState` reports on the wrong connection.
 *
 * Requiring this file gives the caller the same instance the models used, in
 * every layout — Docker (single copy via NODE_PATH), CI, and a dev tree with a
 * stale clicks-shared/node_modules. Host entry points must use it instead of
 * requiring mongoose directly.
 */
const mongoose = require("mongoose");

// Production boots must not create indexes inline. A foreground/autoIndex
// build on Job or Technician locks those collections and the admin lists
// sit on "Loading..." for many seconds.
if (process.env.NODE_ENV === "production") {
  mongoose.set("autoIndex", false);
}

module.exports = mongoose;
