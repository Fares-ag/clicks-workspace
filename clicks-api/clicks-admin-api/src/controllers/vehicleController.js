const Vehicle = require("../models/Vehicle");
const { capAdminLimit } = require("../../../clicks-shared/utils/adminListLimit");
const { uploadBufferToAzure } = require("../utils/azureStorage");

// GET /api/vehicles
async function getVehicles(req, res) {
  try {
    const { page = 1, limit = 10, search = "", status } = req.query;
    const limitNum = capAdminLimit(limit, 10, 100);
    
    // Build search query
    let query = {};
    
    if (search) {
      query.$or = [
        { plateNumber: { $regex: search, $options: "i" } },
        { vinNumber: { $regex: search, $options: "i" } },
        { color: { $regex: search, $options: "i" } }
      ];
    }
    
    // Add status filter (convert string to boolean)
    if (status !== undefined) {
      query.isActive = status === "Active" || status === "true" || status === true;
    }
    
    const vehicles = await Vehicle.find(query)
      .populate("make")
      .populate("model")
      .populate("assignedTechnician")
      .skip((page - 1) * limitNum)
      .limit(limitNum)
      .lean();
    const total = await Vehicle.countDocuments(query);
    res.json({ vehicles, total });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch vehicles", error: err.message });
  }
}

// POST /api/vehicles
async function createVehicle(req, res) {
  try {
    const {
      make,
      model,
      year,
      plateNumber,
      vinNumber,
      color,
      assignedTechnician,
      estimaraExpiration
    } = req.body;
    if (!make || !model || !year || !plateNumber || !vinNumber || !color) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const exists = await Vehicle.findOne({ plateNumber });
    if (exists) return res.status(409).json({ message: "Plate number already exists" });
    
    // Handle file uploads
    const urls = {};
    if (req.files) {
      for (const [field, file] of Object.entries(req.files)) {
        const ext = file[0].originalname.split(".").pop();
        const blobName = `vehicle-docs/${Date.now()}_${field}.${ext}`;
        urls[field] = await uploadBufferToAzure(file[0].buffer, blobName, file[0].mimetype);
      }
    }
    
    const vehicle = await Vehicle.create({
      make,
      model,
      year,
      plateNumber,
      vinNumber,
      color,
      assignedTechnician: assignedTechnician || null,
      estimaraExpiration,
      vehicleImage: urls.vehicleImage,
      estimaraFront: urls.estimaraFront,
      estimaraBack: urls.estimaraBack
    });
    res.status(201).json({ vehicle });
  } catch (err) {
    res.status(500).json({ message: "Failed to create vehicle", error: err.message });
  }
}

// GET /api/vehicles/:id
async function getVehicleById(req, res) {
  try {
    const vehicle = await Vehicle.findById(req.params.id)
      .populate("make")
      .populate("model")
      .populate("assignedTechnician");
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.json({ vehicle });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch vehicle", error: err.message });
  }
}

// PUT /api/vehicles/:id
async function updateVehicle(req, res) {
  try {
    const update = { ...req.body };
    
    // Handle file uploads if present
    if (req.files) {
      for (const [field, file] of Object.entries(req.files)) {
        const ext = file[0].originalname.split(".").pop();
        const blobName = `vehicle-docs/${req.params.id}_${field}_${Date.now()}.${ext}`;
        update[field] = await uploadBufferToAzure(file[0].buffer, blobName, file[0].mimetype);
      }
    }
    
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate("make")
      .populate("model")
      .populate("assignedTechnician");
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.json({ vehicle });
  } catch (err) {
    res.status(500).json({ message: "Failed to update vehicle", error: err.message });
  }
}

// DELETE /api/vehicles/:id
async function deleteVehicle(req, res) {
  try {
    const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.json({ message: "Vehicle deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete vehicle", error: err.message });
  }
}

// POST /api/vehicles/:id/upload-documents
async function uploadDocuments(req, res) {
  try {
    const vehicleId = req.params.id;
    if (!req.files) return res.status(400).json({ message: "No files uploaded" });

    const urls = {};
    for (const [field, file] of Object.entries(req.files)) {
      const ext = file[0].originalname.split(".").pop();
      const blobName = `vehicle-docs/${vehicleId}_${field}_${Date.now()}.${ext}`;
      urls[field] = await uploadBufferToAzure(file[0].buffer, blobName, file[0].mimetype);
    }

    const vehicle = await Vehicle.findByIdAndUpdate(
      vehicleId,
      urls,
      { new: true }
    );
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });

    res.json({ documentUrls: urls });
  } catch (err) {
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
}

// PATCH /api/vehicles/:id/toggle-active
async function toggleActiveStatus(req, res) {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    
    vehicle.isActive = !vehicle.isActive;
    await vehicle.save();
    
    res.json({ vehicle });
  } catch (err) {
    res.status(500).json({ message: "Failed to toggle vehicle status", error: err.message });
  }
}

// PATCH /api/vehicles/:id/unassign-technician
async function unassignTechnician(req, res) {
  try {
    const vehicle = await Vehicle.findByIdAndUpdate(
      req.params.id,
      { $unset: { assignedTechnician: "" } },
      { new: true }
    )
      .populate("make")
      .populate("model");
    
    if (!vehicle) {
      return res.status(404).json({ message: "Vehicle not found" });
    }
    
    res.json({ 
      message: "Technician unassigned successfully",
      vehicle 
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to unassign technician", error: err.message });
  }
}

module.exports = {
  getVehicles,
  createVehicle,
  getVehicleById,
  updateVehicle,
  deleteVehicle,
  uploadDocuments,
  toggleActiveStatus,
  unassignTechnician
};
