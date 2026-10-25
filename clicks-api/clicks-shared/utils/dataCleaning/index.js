const { normalizeJobVehicle, vehicleIsCatalogSafe } = require("./normalizeJobVehicle");
const { normalizeJobIssue } = require("./normalizeJobIssue");
const { normalizeJobType } = require("./normalizeJobType");
const { normalizeCustomerKey, pickDisplayName } = require("./normalizeCustomerKey");
const { normalizeLocationArea, normalizeLocationKey } = require("./normalizeLocationArea");
const { normalizePlate } = require("./normalizePlate");
const { applyCanonicalJobFields } = require("./applyCanonicalFields");

module.exports = {
  normalizeJobVehicle,
  vehicleIsCatalogSafe,
  normalizeJobIssue,
  normalizeJobType,
  normalizeCustomerKey,
  pickDisplayName,
  normalizeLocationArea,
  normalizeLocationKey,
  normalizePlate,
  applyCanonicalJobFields,
};
