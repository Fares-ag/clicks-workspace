const mongoose = require("mongoose");
const { Customer, CustomerVehicle } = require("../../../clicks-shared/models");
const { capAdminLimit } = require("../../../clicks-shared/utils/adminListLimit");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const {
  digitsOnly,
  buildPrefixSearchFilter,
} = require("../../../clicks-shared/utils/searchFields");

function serializeVehicle(v) {
  const o = v.toObject ? v.toObject() : v;
  const customer = o.customer_id && typeof o.customer_id === "object" ? o.customer_id : null;
  const make = o.vehicle_make && typeof o.vehicle_make === "object" ? o.vehicle_make : null;
  const model = o.vehicle_model && typeof o.vehicle_model === "object" ? o.vehicle_model : null;
  return {
    id: o._id.toString(),
    _id: o._id.toString(),
    plate: o.plate_number || "",
    year: o.year,
    color: o.vehicle_color || "",
    make: make?.makeName || "",
    model: model?.modelName || "",
    customer: customer
      ? {
          id: customer._id.toString(),
          phone: customer.phone_number || "",
          name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
        }
      : o.customer_id
        ? { id: String(o.customer_id) }
        : null,
  };
}

function populateVehicles(query) {
  return query
    .populate("customer_id", "first_name last_name phone_number")
    .populate("vehicle_make", "makeName")
    .populate("vehicle_model", "modelName");
}

async function customerIdsForSearch(term) {
  const rx = new RegExp(escapeRegex(term), "i");
  const digits = digitsOnly(term);
  const customerQuery =
    digits.length >= 4
      ? { search_phone: new RegExp(`^${escapeRegex(digits)}`) }
      : buildPrefixSearchFilter(term, {
          phoneField: "search_phone",
          nameField: "search_name",
        }) || {
          $or: [{ first_name: rx }, { last_name: rx }, { phone_number: rx }],
        };
  const customers = await Customer.find(customerQuery).select("_id").limit(50).lean();
  return customers.map((c) => c._id);
}

async function listVehicles(req, res) {
  try {
    const { page = 1, limit = 20, search = "", customer_id } = req.query;
    const limitNum = capAdminLimit(limit, 20, 100);
    const match = {};
    if (customer_id) {
      if (!mongoose.isValidObjectId(customer_id)) {
        return res.status(400).json({ message: "Invalid customer_id" });
      }
      match.customer_id = customer_id;
    }
    const term = String(search || "").trim().slice(0, 64);
    if (term) {
      const rx = new RegExp(escapeRegex(term), "i");
      const customerIds = await customerIdsForSearch(term);
      const or = [{ plate_number: rx }];
      if (customerIds.length) or.push({ customer_id: { $in: customerIds } });
      match.$or = or;
    }
    const skip = (Math.max(1, Number(page)) - 1) * limitNum;
    const [rows, total] = await Promise.all([
      populateVehicles(CustomerVehicle.find(match).sort({ createdAt: -1 }).skip(skip).limit(limitNum)),
      CustomerVehicle.countDocuments(match),
    ]);
    res.json({
      vehicles: rows.map(serializeVehicle),
      total,
      page: Number(page),
      limit: limitNum,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to list customer vehicles", error: err.message });
  }
}

async function listForCustomer(req, res) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Customer not found" });
    }
    const customer = await Customer.findById(req.params.id).select("_id");
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    const rows = await populateVehicles(
      CustomerVehicle.find({ customer_id: customer._id }).sort({ createdAt: -1 })
    );
    res.json({ vehicles: rows.map(serializeVehicle) });
  } catch (err) {
    res.status(500).json({ message: "Failed to list customer vehicles", error: err.message });
  }
}

module.exports = {
  listVehicles,
  listForCustomer,
};
