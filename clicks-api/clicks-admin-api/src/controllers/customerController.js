const Customer = require("../models/Customer");
const { cachedCount } = require("../../../clicks-shared/utils/cachedCount");
const { capAdminLimit } = require("../../../clicks-shared/utils/adminListLimit");
const { buildPrefixSearchFilter } = require("../../../clicks-shared/utils/searchFields");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const { str, normaliseEmail } = require("../../../clicks-shared/utils/coerce");
const { recordAudit } = require("../utils/auditLog");
const { postToTechApi } = require("../utils/techApiNotify");

// GET /api/customers
async function getCustomers(req, res) {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const limitNum = capAdminLimit(limit, 10, 100);
    const term = String(search || "").trim().slice(0, 64);
    let query = {};

    if (term) {
      const prefixFilter = buildPrefixSearchFilter(term, {
        phoneField: "search_phone",
        nameField: "search_name",
      });
      if (prefixFilter) {
        query = prefixFilter;
      } else {
        const rx = new RegExp(escapeRegex(term), "i");
        query = {
          $or: [
            { first_name: rx },
            { last_name: rx },
            { email: rx },
            { phone_number: rx },
          ],
        };
      }
    }
    
    const customers = await Customer.find(query)
      .select("-password")
      .skip((page - 1) * limitNum)
      .limit(limitNum)
      .sort({ createdAt: -1 })
      .lean();
    
    const total = await cachedCount(Customer, query, {
      ttlMs: 15000,
      key: `customers:${term}`,
    });
    res.json({ customers, total });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch customers", error: err.message });
  }
}

// GET /api/customers/:id
async function getCustomerById(req, res) {
  try {
    const customer = await Customer.findById(req.params.id).select("-password");
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json({ customer });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch customer", error: err.message });
  }
}

/**
 * Tell the customer/tech API to drop this customer's live sockets (scenario
 * 14). Same internal-notify pattern as SOS outcomes; never blocks the admin
 * action — REST calls are already refused by the status check.
 */
function disconnectCustomerSockets(customerId) {
  return postToTechApi("/api/customers/internal/disconnect", {
    customer_id: String(customerId),
  });
}

// PUT /api/customers/:id
async function updateCustomer(req, res) {
  try {
    const first_name = str(req.body.first_name, { maxLength: 80 }).trim();
    const last_name = str(req.body.last_name, { maxLength: 80 }).trim();
    const email = normaliseEmail(req.body.email);
    const status = str(req.body.status, { maxLength: 16 });
    const update = {};

    if (first_name) update.first_name = first_name;
    if (last_name) update.last_name = last_name;
    if (email) update.email = email;
    if (status) {
      if (!["Active", "Inactive"].includes(status)) {
        return res.status(400).json({ message: "Invalid status", code: "INVALID_STATUS" });
      }
      update.status = status;
    }

    const before = await Customer.findById(req.params.id).select("status").lean();
    if (!before) return res.status(404).json({ message: "Customer not found" });

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).select("-password");

    if (!customer) return res.status(404).json({ message: "Customer not found" });
    if (update.status && update.status !== before.status) {
      await recordAudit({
        req,
        action: update.status === "Inactive" ? "customer.block" : "customer.unblock",
        entityType: "Customer",
        entityId: customer._id,
        changes: { status: { from: before.status, to: update.status } },
      });
      if (update.status === "Inactive") await disconnectCustomerSockets(customer._id);
    }
    res.json({ customer });
  } catch (err) {
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ message: "Email or phone already registered", code: "DUPLICATE_CUSTOMER" });
    }
    res.status(500).json({ message: "Failed to update customer", error: err.message });
  }
}

// DELETE /api/customers/:id
async function deleteCustomer(req, res) {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    await disconnectCustomerSockets(customer._id);
    res.json({ message: "Customer deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete customer", error: err.message });
  }
}

module.exports = {
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer
};
