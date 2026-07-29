const VehicleInsurance = require("../models/VehicleInsurance");

// GET /api/vehicle-insurance
async function getVehicleInsurances(req, res) {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    
    const query = search
      ? {
          $or: [
            { clientName: { $regex: search, $options: "i" } },
            { plateNumber: { $regex: search, $options: "i" } },
            { vinNumber: { $regex: search, $options: "i" } }
          ]
        }
      : {};
    
    const insurances = await VehicleInsurance.find(query)
      .populate("make", "makeName")
      .populate("model", "modelName")
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });
    
    const total = await VehicleInsurance.countDocuments(query);
    res.json({ insurances, total });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch vehicle insurances", error: err.message });
  }
}

// POST /api/vehicle-insurance
async function createVehicleInsurance(req, res) {
  try {
    const {
      make,
      model,
      year,
      color,
      plateNumber,
      vinNumber,
      clientName,
      phoneNumber,
      subscriptionType,
      startDate,
      endDate
    } = req.body;
    
    // Check if plate number or VIN already exists
    const existing = await VehicleInsurance.findOne({
      $or: [{ plateNumber }, { vinNumber }]
    });
    
    if (existing) {
      return res.status(400).json({
        message: "Vehicle with this plate number or VIN already exists"
      });
    }
    
    const insurance = new VehicleInsurance({
      make,
      model,
      year,
      color,
      plateNumber,
      vinNumber,
      clientName,
      phoneNumber,
      subscriptionType,
      startDate,
      endDate,
      status: "Active"
    });
    
    await insurance.save();
    await insurance.populate("make", "makeName");
    await insurance.populate("model", "modelName");
    
    res.status(201).json({ insurance });
  } catch (err) {
    res.status(500).json({ message: "Failed to create vehicle insurance", error: err.message });
  }
}

// GET /api/vehicle-insurance/:id
async function getVehicleInsuranceById(req, res) {
  try {
    const insurance = await VehicleInsurance.findById(req.params.id)
      .populate("make", "makeName")
      .populate("model", "modelName");
    
    if (!insurance) {
      return res.status(404).json({ message: "Vehicle insurance not found" });
    }
    
    res.json({ insurance });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch vehicle insurance", error: err.message });
  }
}

// PUT /api/vehicle-insurance/:id
async function updateVehicleInsurance(req, res) {
  try {
    const updates = req.body;
    
    const insurance = await VehicleInsurance.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    )
      .populate("make", "makeName")
      .populate("model", "modelName");
    
    if (!insurance) {
      return res.status(404).json({ message: "Vehicle insurance not found" });
    }
    
    res.json({ insurance });
  } catch (err) {
    res.status(500).json({ message: "Failed to update vehicle insurance", error: err.message });
  }
}

// DELETE /api/vehicle-insurance/:id
async function deleteVehicleInsurance(req, res) {
  try {
    const insurance = await VehicleInsurance.findByIdAndDelete(req.params.id);
    
    if (!insurance) {
      return res.status(404).json({ message: "Vehicle insurance not found" });
    }
    
    res.json({ message: "Vehicle insurance deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete vehicle insurance", error: err.message });
  }
}

module.exports = {
  getVehicleInsurances,
  createVehicleInsurance,
  getVehicleInsuranceById,
  updateVehicleInsurance,
  deleteVehicleInsurance
};
