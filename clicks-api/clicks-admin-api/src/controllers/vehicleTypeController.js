const { VehicleType } = require("../../../clicks-shared/models");

// GET /api/vehicle-types
async function getVehicleTypes(req, res) {
  try {
    const types = await VehicleType.find().sort({ typeName: 1 });
    res.json({ types });
  } catch (err) {
    res.status(500).json({ error: "Fetch vehicle types failed", details: err.message });
  }
}

// GET /api/vehicle-types/active
async function getActiveVehicleTypes(req, res) {
  try {
    const types = await VehicleType.find({ isActive: true }).sort({ typeName: 1 });
    res.json({ types });
  } catch (err) {
    res.status(500).json({ error: "Fetch active vehicle types failed", details: err.message });
  }
}

// POST /api/vehicle-types
async function createVehicleType(req, res) {
  try {
    const { typeName, isActive } = req.body;
    
    if (!typeName) {
      return res.status(400).json({ error: "Type name is required" });
    }
    
    const type = new VehicleType({ 
      typeName, 
      isActive: isActive !== false 
    });
    
    await type.save();
    res.status(201).json({ message: "Vehicle type created successfully", type });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Vehicle type already exists" });
    }
    res.status(500).json({ error: "Create vehicle type failed", details: err.message });
  }
}

// PUT /api/vehicle-types/:id
async function updateVehicleType(req, res) {
  try {
    const { typeName, isActive } = req.body;
    
    const type = await VehicleType.findByIdAndUpdate(
      req.params.id,
      { typeName, isActive },
      { new: true, runValidators: true }
    );
    
    if (!type) {
      return res.status(404).json({ error: "Vehicle type not found" });
    }
    
    res.json({ message: "Vehicle type updated successfully", type });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: "Vehicle type already exists" });
    }
    res.status(500).json({ error: "Update vehicle type failed", details: err.message });
  }
}

// DELETE /api/vehicle-types/:id
async function deleteVehicleType(req, res) {
  try {
    const type = await VehicleType.findByIdAndDelete(req.params.id);
    
    if (!type) {
      return res.status(404).json({ error: "Vehicle type not found" });
    }
    
    res.json({ message: "Vehicle type deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Delete vehicle type failed", details: err.message });
  }
}

module.exports = {
  getVehicleTypes,
  getActiveVehicleTypes,
  createVehicleType,
  updateVehicleType,
  deleteVehicleType
};
