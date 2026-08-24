const { Vendor } = require("../../../clicks-shared/models");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const { str, objectId } = require("../../../clicks-shared/utils/coerce");

// Projection shared by every vendor response so the finance portal always sees
// the same keys back from list / create / update.
const VENDOR_FIELDS = "name category contactPerson phone email notes isActive createdAt";

function serializeVendor(vendor) {
  if (!vendor) return null;
  return {
    _id: vendor._id,
    name: vendor.name || "",
    category: vendor.category || "",
    contactPerson: vendor.contactPerson || "",
    phone: vendor.phone || "",
    email: vendor.email || "",
    notes: vendor.notes || "",
    isActive: vendor.isActive !== false,
    createdAt: vendor.createdAt,
  };
}

/**
 * Allow-list the writable vendor fields. Everything is coerced through str()
 * so a `{"$ne": null}` body can never reach a query or an update document.
 * Returns { fields } or { error }.
 */
function parseVendorBody(body, { requireName }) {
  const src = body && typeof body === "object" ? body : {};
  const fields = {};

  if (requireName || src.name !== undefined) {
    const name = str(src.name, { maxLength: 200 }).trim();
    if (!name) return { error: "Vendor name is required" };
    fields.name = name;
  }
  if (src.category !== undefined) {
    fields.category = str(src.category, { maxLength: 120 }).trim();
  }
  if (src.contactPerson !== undefined) {
    fields.contactPerson = str(src.contactPerson, { maxLength: 120 }).trim();
  }
  if (src.phone !== undefined) {
    fields.phone = str(src.phone, { maxLength: 40 }).trim();
  }
  if (src.email !== undefined) {
    fields.email = str(src.email, { maxLength: 254 }).trim().toLowerCase();
  }
  if (src.notes !== undefined) {
    fields.notes = str(src.notes, { maxLength: 1000 });
  }
  if (src.isActive !== undefined) {
    fields.isActive = src.isActive === true || src.isActive === "true";
  }

  return { fields };
}

async function listVendors(req, res) {
  try {
    const search = str(req.query.search, { maxLength: 64 }).trim();
    const isActive = str(req.query.isActive).trim().toLowerCase();

    const query = {};
    if (isActive === "true") {
      query.isActive = true;
    } else if (isActive === "false") {
      query.isActive = false;
    }

    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      query.$or = [
        { name: rx },
        { category: rx },
        { contactPerson: rx },
        { phone: rx },
        { email: rx },
      ];
    }

    // Deliberately unpaged: the response is a plain { vendors: [...] } with no
    // total, so a limit here would hand the vendor picker a short list with no
    // way to tell truncation from completeness — and the cost-row picker could
    // then not select the vendors it dropped.
    const vendors = await Vendor.find(query)
      .select(VENDOR_FIELDS)
      .sort({ name: 1 })
      .lean();

    res.json({ vendors: vendors.map(serializeVendor) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch vendors", error: err.message });
  }
}

async function createVendor(req, res) {
  try {
    const parsed = parseVendorBody(req.body, { requireName: true });
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }

    const created = await Vendor.create(parsed.fields);
    res.status(201).json({ vendor: serializeVendor(created) });
  } catch (err) {
    res.status(500).json({ message: "Failed to create vendor", error: err.message });
  }
}

async function updateVendor(req, res) {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid vendor id" });

    const parsed = parseVendorBody(req.body, { requireName: false });
    if (parsed.error) {
      return res.status(400).json({ message: parsed.error });
    }
    if (!Object.keys(parsed.fields).length) {
      return res.status(400).json({ message: "No vendor fields to update" });
    }

    const vendor = await Vendor.findOneAndUpdate(
      { _id: id },
      { $set: parsed.fields },
      { new: true, runValidators: true }
    )
      .select(VENDOR_FIELDS)
      .lean();

    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    res.json({ vendor: serializeVendor(vendor) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update vendor", error: err.message });
  }
}

/**
 * Soft delete only. Audited cost rows keep a vendor_id reference, so a hard
 * delete would leave those rows pointing at a document that no longer exists.
 */
async function deleteVendor(req, res) {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid vendor id" });

    const vendor = await Vendor.findOneAndUpdate(
      { _id: id },
      { $set: { isActive: false } },
      { new: true }
    )
      .select("_id")
      .lean();

    if (!vendor) return res.status(404).json({ message: "Vendor not found" });

    res.json({ message: "Vendor deactivated" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete vendor", error: err.message });
  }
}

module.exports = {
  listVendors,
  createVendor,
  updateVendor,
  deleteVendor,
};
