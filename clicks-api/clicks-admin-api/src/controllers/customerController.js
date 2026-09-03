const Customer = require("../models/Customer");
const { cachedCount } = require("../../../clicks-shared/utils/cachedCount");
const { capAdminLimit } = require("../../../clicks-shared/utils/adminListLimit");
const { buildPrefixSearchFilter } = require("../../../clicks-shared/utils/searchFields");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");

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

// PUT /api/customers/:id
async function updateCustomer(req, res) {
  try {
    const { first_name, last_name, email, status } = req.body;
    const update = {};
    
    if (first_name) update.first_name = first_name;
    if (last_name) update.last_name = last_name;
    if (email) update.email = email;
    if (status) update.status = status;
    
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    ).select("-password");
    
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json({ customer });
  } catch (err) {
    res.status(500).json({ message: "Failed to update customer", error: err.message });
  }
}

// DELETE /api/customers/:id
async function deleteCustomer(req, res) {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
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
