const { CustomerVehicle, VehicleMake, VehicleModel, VehicleType } = require("../../../clicks-shared/models");
const { assertVehicleOwner } = require("../utils/ownership");

const addVehicle = async (req, res) => {
  try {
    const {
      vehicle_make,
      vehicle_type,
      vehicle_model,
      year,
      vehicle_color,
      plate_number,
      vin_number,
    } = req.body;
    // Get customer_id from authenticated user
    const customer_id = req.user.id;

    if (!vehicle_make || !vehicle_model || !year || !vehicle_color) {
      return res.status(400).json({ error: "Make, model, year, and color are required" });
    }

    let resolvedType = vehicle_type;
    if (!resolvedType) {
      const fallbackType = await VehicleType.findOne({ isActive: true }).sort({
        typeName: 1,
      });
      if (!fallbackType) {
        return res.status(400).json({ error: "No vehicle type configured" });
      }
      resolvedType = fallbackType._id;
    }

    const plate = plate_number != null ? String(plate_number).trim() : "";
    const vin = vin_number != null ? String(vin_number).trim() : "";

    if (plate) {
      const existing = await CustomerVehicle.findOne({ plate_number: plate });
      if (existing) {
        return res.status(409).json({ error: "Plate number already registered" });
      }
    }

    const vehicle = new CustomerVehicle({
      customer_id,
      vehicle_make,
      vehicle_type: resolvedType,
      vehicle_model,
      year,
      vehicle_color,
      plate_number: plate,
      vin_number: vin,
    });
    await vehicle.save();
    res.status(201).json({ message: "Vehicle added successfully", vehicle });
  } catch (err) {
    res.status(500).json({ error: "Add vehicle failed", details: err.message });
  }
};

const getVehicles = async (req, res) => {
  try {
    // Get customer_id from authenticated user instead of query params
    const customer_id = req.user.id;
    const vehicles = await CustomerVehicle.find({ customer_id })
      .populate('vehicle_make', 'makeName')
      .populate('vehicle_model', 'modelName')
      .populate('vehicle_type', 'typeName');
    res.json({ vehicles });
  } catch (err) {
    res.status(500).json({ error: "Fetch vehicles failed", details: err.message });
  }
};

const getVehicleMakes = async (req, res) => {
  try {
    const makes = await VehicleMake.find({ isActive: true }).sort({
      makeName: 1,
    });
    res.json({ makes });
  } catch (err) {
    res.status(500).json({ error: "Fetch vehicle makes failed", details: err.message });
  }
};

const getVehicleModels = async (req, res) => {
  try {
    const { makeId } = req.query;
    const models = await VehicleModel.find({ makeId, isActive: true }).sort({
      modelName: 1,
    });
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: "Fetch vehicle models failed", details: err.message });
  }
};

const getVehicleTypes = async (req, res) => {
  try {
    const types = await VehicleType.find({ isActive: true }).sort({ typeName: 1 });
    res.json({ types });
  } catch (err) {
    res.status(500).json({ error: "Fetch vehicle types failed", details: err.message });
  }
};

const updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;
    const vehicle = await CustomerVehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    if (!assertVehicleOwner(vehicle, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    Object.assign(vehicle, update);
    await vehicle.save();
    res.json({ message: "Vehicle updated", vehicle });
  } catch (err) {
    res.status(500).json({ error: "Update vehicle failed", details: err.message });
  }
};

const deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const vehicle = await CustomerVehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    if (!assertVehicleOwner(vehicle, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await vehicle.deleteOne();
    res.json({ message: "Vehicle deleted" });
  } catch (err) {
    res.status(500).json({ error: "Delete vehicle failed", details: err.message });
  }
};

module.exports = {
  addVehicle,
  getVehicles,
  getVehicleMakes,
  getVehicleModels,
  getVehicleTypes,
  updateVehicle,
  deleteVehicle
};
