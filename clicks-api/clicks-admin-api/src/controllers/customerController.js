const Customer = require("../models/Customer");

// GET /api/customers
async function getCustomers(req, res) {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const query = search
      ? {
          $or: [
            { first_name: { $regex: search, $options: "i" } },
            { last_name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { phone_number: { $regex: search, $options: "i" } }
          ]
        }
      : {};
    
    const customers = await Customer.find(query)
      .select("-password")
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });
    
    const total = await Customer.countDocuments(query);
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
