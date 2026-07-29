const VehicleMake = require("../models/VehicleMake");

// GET /api/vehicle-makes
async function getVehicleMakes(req, res) {
  try {
    const makes = await VehicleMake.find().sort({ makeName: 1 });
    res.json({ makes });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch vehicle makes", error: err.message });
  }
}

// POST /api/vehicle-makes
async function createVehicleMake(req, res) {
  try {
    const { makeName, isActive } = req.body;
    if (!makeName || typeof isActive !== "boolean") {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const exists = await VehicleMake.findOne({ makeName });
    if (exists) return res.status(409).json({ message: "Make already exists" });
    const make = await VehicleMake.create({ makeName, isActive });
    res.status(201).json({ make });
  } catch (err) {
    res.status(500).json({ message: "Failed to create vehicle make", error: err.message });
  }
}

// GET /api/vehicle-makes/:id
async function getVehicleMakeById(req, res) {
  try {
    const make = await VehicleMake.findById(req.params.id);
    if (!make) return res.status(404).json({ message: "Make not found" });
    res.json({ make });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch vehicle make", error: err.message });
  }
}

// PUT /api/vehicle-makes/:id
async function updateVehicleMake(req, res) {
  try {
    const { makeName, isActive } = req.body;
    const update = {};
    if (makeName) update.makeName = makeName;
    if (typeof isActive === "boolean") update.isActive = isActive;
    const make = await VehicleMake.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!make) return res.status(404).json({ message: "Make not found" });
    res.json({ make });
  } catch (err) {
    res.status(500).json({ message: "Failed to update vehicle make", error: err.message });
  }
}

// DELETE /api/vehicle-makes/:id
async function deleteVehicleMake(req, res) {
  try {
    const make = await VehicleMake.findByIdAndDelete(req.params.id);
    if (!make) return res.status(404).json({ message: "Make not found" });
    res.json({ message: "Vehicle make deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete vehicle make", error: err.message });
  }
}

module.exports = {
  getVehicleMakes,
  createVehicleMake,
  getVehicleMakeById,
  updateVehicleMake,
  deleteVehicleMake
};
