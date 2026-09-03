function digitsOnly(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length > 8) return d.slice(-8);
  return d;
}

function normalizeSearchName(name) {
  return String(name || "").trim().toLowerCase();
}

function computeJobSearchFields(doc) {
  return {
    search_phone: digitsOnly(doc.clientMobileNumber),
    search_name: normalizeSearchName(doc.clientName),
  };
}

function computeLeadSearchFields(doc) {
  return {
    search_phone: digitsOnly(doc.clientMobileNumber),
    search_name: normalizeSearchName(doc.clientName),
  };
}

/** Build indexed prefix search filter for jobs/leads list endpoints. */
function buildPrefixSearchFilter(search, { phoneField, nameField, businessNameField }) {
  const term = String(search || "").trim();
  if (!term) return null;

  const { escapeRegex } = require("./escapeRegex");
  const digits = digitsOnly(term);

  if (digits.length >= 4) {
    const escaped = escapeRegex(digits);
    return { [phoneField]: new RegExp(`^${escaped}`) };
  }

  const namePrefix = escapeRegex(normalizeSearchName(term));
  const or = [{ [nameField]: new RegExp(`^${namePrefix}`) }];
  if (businessNameField) {
    or.push({ [businessNameField]: new RegExp(`^${escapeRegex(term)}`, "i") });
  }
  return { $or: or };
}

function computeCustomerSearchFields(doc) {
  return {
    search_name: normalizeSearchName(`${doc.first_name || ""} ${doc.last_name || ""}`),
    search_phone: digitsOnly(doc.phone_number),
  };
}

function computeTechnicianSearchFields(doc) {
  return {
    search_name: normalizeSearchName(`${doc.firstName || ""} ${doc.lastName || ""}`),
    search_phone: digitsOnly(doc.phone),
  };
}

module.exports = {
  digitsOnly,
  normalizeSearchName,
  computeJobSearchFields,
  computeLeadSearchFields,
  computeCustomerSearchFields,
  computeTechnicianSearchFields,
  buildPrefixSearchFilter,
};
