const VehicleModel = require("../models/VehicleModel");

// GET /api/vehicle-models
async function getVehicleModels(req, res) {
  try {
    const { makeId } = req.query;
    const filter = makeId ? { makeId } : {};
    const models = await VehicleModel.find(filter).sort({ modelName: 1 });
    res.json({ models });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch vehicle models", error: err.message });
  }
}

// POST /api/vehicle-models
async function createVehicleModel(req, res) {
  try {
    const { makeId, modelName, isActive } = req.body;
    if (!makeId || !modelName || typeof isActive !== "boolean") {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const exists = await VehicleModel.findOne({ makeId, modelName });
    if (exists) return res.status(409).json({ message: "Model already exists for this make" });
    const model = await VehicleModel.create({ makeId, modelName, isActive });
    res.status(201).json({ model });
  } catch (err) {
    res.status(500).json({ message: "Failed to create vehicle model", error: err.message });
  }
}

// GET /api/vehicle-models/:id
async function getVehicleModelById(req, res) {
  try {
    const model = await VehicleModel.findById(req.params.id);
    if (!model) return res.status(404).json({ message: "Model not found" });
    res.json({ model });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch vehicle model", error: err.message });
  }
}

// PUT /api/vehicle-models/:id
async function updateVehicleModel(req, res) {
  try {
    const { modelName, isActive } = req.body;
    const update = {};
    if (modelName) update.modelName = modelName;
    if (typeof isActive === "boolean") update.isActive = isActive;
    const model = await VehicleModel.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!model) return res.status(404).json({ message: "Model not found" });
    res.json({ model });
  } catch (err) {
    res.status(500).json({ message: "Failed to update vehicle model", error: err.message });
  }
}

// DELETE /api/vehicle-models/:id
async function deleteVehicleModel(req, res) {
  try {
    const model = await VehicleModel.findByIdAndDelete(req.params.id);
    if (!model) return res.status(404).json({ message: "Model not found" });
    res.json({ message: "Vehicle model deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete vehicle model", error: err.message });
  }
}

// GET /api/vehicle-models/by-make/:makeId
async function getVehicleModelsByMake(req, res) {
  try {
    const { makeId } = req.params;
    const models = await VehicleModel.find({ makeId }).sort({ modelName: 1 });
    res.json({ models });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch models by make", error: err.message });
  }
}

module.exports = {
  getVehicleModels,
  createVehicleModel,
  getVehicleModelById,
  updateVehicleModel,
  deleteVehicleModel,
  getVehicleModelsByMake
};
