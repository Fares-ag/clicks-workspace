const { CustomerVehicle, VehicleMake, VehicleModel, VehicleType } = require("../../../clicks-shared/models");
const { assertVehicleOwner } = require("../utils/ownership");
const { pick, str, num, objectId } = require("../../../clicks-shared/utils/coerce");

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
        return res.status(409).json({ error: "Plate number already registered", code: "PLATE_ALREADY_REGISTERED" });
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
    res.status(500).json({ error: "Add vehicle failed", code: "VEHICLE_REQUEST_FAILED" });
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
    res.status(500).json({ error: "Fetch vehicles failed", code: "VEHICLE_REQUEST_FAILED" });
  }
};

const getVehicleMakes = async (req, res) => {
  try {
    const makes = await VehicleMake.find({ isActive: true }).sort({
      makeName: 1,
    });
    res.json({ makes });
  } catch (err) {
    res.status(500).json({ error: "Fetch vehicle makes failed", code: "VEHICLE_REQUEST_FAILED" });
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
    res.status(500).json({ error: "Fetch vehicle models failed", code: "VEHICLE_REQUEST_FAILED" });
  }
};

const getVehicleTypes = async (req, res) => {
  try {
    const types = await VehicleType.find({ isActive: true }).sort({ typeName: 1 });
    res.json({ types });
  } catch (err) {
    res.status(500).json({ error: "Fetch vehicle types failed", code: "VEHICLE_REQUEST_FAILED" });
  }
};

/**
 * The only fields a customer may edit (scenario 24). Was
 * `Object.assign(vehicle, req.body)`: a crafted body could set `customer_id`
 * and move the car (and the membership tied to it) onto another account.
 * Make, model, year, colour, plate, nickname — plus the type/VIN the add
 * form already collects.
 */
const EDITABLE_VEHICLE_FIELDS = [
  "vehicle_make",
  "vehicle_model",
  "vehicle_type",
  "year",
  "vehicle_color",
  "plate_number",
  "vin_number",
  "nickname",
];

const updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const vehicle = await CustomerVehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found", code: "VEHICLE_NOT_FOUND" });
    }
    if (!assertVehicleOwner(vehicle, req.user)) {
      return res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
    }
    const update = pick(req.body || {}, EDITABLE_VEHICLE_FIELDS);
    for (const key of ["plate_number", "vin_number", "vehicle_color", "nickname"]) {
      if (update[key] !== undefined) update[key] = str(update[key], { maxLength: 64 }).trim();
    }
    for (const key of ["vehicle_make", "vehicle_model", "vehicle_type"]) {
      if (update[key] !== undefined && !objectId(update[key])) {
        return res.status(400).json({ error: `Invalid ${key}`, code: "VEHICLE_INVALID" });
      }
    }
    if (update.year !== undefined) {
      const year = num(update.year, { min: 1950, max: new Date().getFullYear() + 1, integer: true });
      if (year === null) {
        return res.status(400).json({ error: "Invalid year", code: "VEHICLE_INVALID" });
      }
      update.year = year;
    }
    // Same plate rule as add: a plate already on another vehicle is refused.
    if (update.plate_number && update.plate_number !== vehicle.plate_number) {
      const taken = await CustomerVehicle.exists({
        plate_number: update.plate_number,
        _id: { $ne: vehicle._id },
      });
      if (taken) {
        return res
          .status(409)
          .json({ error: "Plate number already registered", code: "PLATE_ALREADY_REGISTERED" });
      }
    }
    // `nickname` is not in the shared schema yet; strict mode drops it, so it
    // is accepted but has no effect until the field exists.
    vehicle.set(update);
    await vehicle.save();
    res.json({ message: "Vehicle updated", vehicle });
  } catch (err) {
    if (err?.name === "ValidationError" || err?.name === "CastError") {
      return res.status(400).json({ error: "Invalid vehicle details", code: "VEHICLE_INVALID" });
    }
    console.error("updateVehicle failed:", err.message);
    res.status(500).json({ error: "Update vehicle failed", code: "VEHICLE_UPDATE_FAILED" });
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
    res.status(500).json({ error: "Delete vehicle failed", code: "VEHICLE_REQUEST_FAILED" });
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
