/**
 * The ONE name rule, shared by register, edit profile and the app
 * (clicks-user/lib/core/helper/validation_helper.dart mirrors it):
 *
 *   first and last name: 1–50 characters; letters (any script, so Arabic
 *   passes), spaces, apostrophe and hyphen. Must start with a letter.
 *
 * Before this, register accepted "Al" while edit profile rejected last names
 * under 3 characters, and an 80-char first name passed register and then
 * failed the schema as a 500 (scenario 17).
 */
const NAME_MAX = 50;
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s'’-]*$/u;

function normalizeName(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ");
}

function isValidName(raw) {
  const name = normalizeName(raw);
  return name.length >= 1 && name.length <= NAME_MAX && NAME_RE.test(name);
}

/** @returns {string|null} error code, or null when both are valid */
function validateNames({ first_name, last_name }, { partial = false } = {}) {
  for (const [field, value] of [
    ["first_name", first_name],
    ["last_name", last_name],
  ]) {
    if (partial && value === undefined) continue;
    if (!isValidName(value)) return `INVALID_${field.toUpperCase()}`;
  }
  return null;
}

module.exports = { NAME_MAX, NAME_RE, normalizeName, isValidName, validateNames };
