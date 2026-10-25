const { digitsOnly, normalizeSearchName } = require("../searchFields");

function normalizeCustomerKey(name, phone) {
  const rawName = String(name || "").trim();
  const rawPhone = String(phone || "").trim();
  const phoneKey = digitsOnly(rawPhone);
  return {
    phoneKey,
    displayName: rawName,
    searchName: normalizeSearchName(rawName),
    rawName,
    rawPhone,
  };
}

function pickDisplayName(nameCounts) {
  let bestName = "";
  let bestCount = 0;
  for (const [name, count] of Object.entries(nameCounts || {})) {
    if (count > bestCount || (count === bestCount && name && name < bestName)) {
      bestName = name;
      bestCount = count;
    }
  }
  return bestName;
}

module.exports = {
  normalizeCustomerKey,
  pickDisplayName,
};
