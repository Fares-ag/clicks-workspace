const bcrypt = require("bcryptjs");
const Technician = require("../models/Technician");
const Job = require("../models/Job");
const TechnicianEarnings = require("../models/TechnicianEarnings");
const Receipt = require("../models/Receipt");
const Vehicle = require("../../../clicks-shared/models/Vehicle");
const { uploadBufferToAzure } = require("../utils/azureStorage");
const { addSASToTechnician, addSASToTechnicians } = require("../utils/sasHelper");

function looksHashed(password) {
  return typeof password === "string" && /^\$2[aby]?\$/.test(password);
}

function toLiveMapTechnician(t) {
  const [longitude = 0, latitude = 0] = t.currentLocation?.coordinates || [0, 0];
  const v = t.assignedVehicle;
  return {
    _id: t._id,
    firstName: t.firstName,
    lastName: t.lastName,
    phone: t.phone,
    currentStatus: t.currentStatus,
    profilePicture: t.profilePicture,
    location: { latitude, longitude },
    vehicle: v
      ? {
          _id: v._id,
          make: v.make?.makeName || "",
          model: v.model?.modelName || "",
          plateNumber: v.plateNumber,
        }
      : null,
  };
}

// GET /api/technicians/live-map
async function getLiveMapTechnicians(req, res) {
  try {
    const technicians = await Technician.find({
      isActive: true,
      currentStatus: { $in: ["Online", "On Job"] },
    })
      .select(
        "firstName lastName phone currentStatus profilePicture currentLocation assignedVehicle"
      )
      .populate({
        path: "assignedVehicle",
        select: "plateNumber make model",
        populate: [
          { path: "make", select: "makeName" },
          { path: "model", select: "modelName" },
        ],
      });

    res.json({
      technicians: technicians.map(toLiveMapTechnician),
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch live map technicians",
      error: err.message,
    });
  }
}

async function getTechnicians(req, res) {
  try {
    const { page = 1, limit = 10, search = "", currentStatus, applicationStatus } = req.query;
    const query = {};
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }
    
    if (currentStatus) {
      query.currentStatus = currentStatus;
    }
    
    if (applicationStatus) {
      query.applicationStatus = applicationStatus;
    }
    
    const technicians = await Technician.find(query)
      .select("firstName lastName phone applicationStatus currentStatus isActive assignedVehicle profilePicture expertise")
      .populate({
        path: 'assignedVehicle',
        populate: [
          { path: 'make', select: 'makeName' },
          { path: 'model', select: 'modelName' }
        ]
      })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Technician.countDocuments(query);
    
    // Add SAS tokens to sensitive documents
    const techniciansWithSAS = addSASToTechnicians(technicians);
    
    res.json({ technicians: techniciansWithSAS, total });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch technicians", error: err.message });
  }
}

// POST /api/technicians
async function createTechnician(req, res) {
  console.log("Creating technician with data:", req);
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      workPermitFront,
      workPermitBack,
      workPermitExpiration,
      drivingLicenseFront,
      drivingLicenseBack,
      drivingLicenseExpiration,
      assignedVehicle
    } = req.body;
    
    // Handle expertise array from FormData
    const expertise = req.body.expertise 
      ? (Array.isArray(req.body.expertise) ? req.body.expertise : [req.body.expertise])
      : [];
    
    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const exists = await Technician.findOne({ email });
    if (exists) return res.status(409).json({ message: "Email already exists" });
    const hashedPassword = looksHashed(password)
      ? password
      : await bcrypt.hash(password, 10);
    const technician = await Technician.create({
      firstName,
      lastName,
      email,
      phone,
      password: hashedPassword,
      expertise,
      workPermitFront,
      workPermitBack,
      workPermitExpiration,
      drivingLicenseFront,
      drivingLicenseBack,
      drivingLicenseExpiration,
      assignedVehicle,
      applicationStatus: "Pending",
      currentStatus: "Offline",
      isActive: true
    });
    res.status(201).json({ technician });
  } catch (err) {
    res.status(500).json({ message: "Failed to create technician", error: err.message });
  }
}

// GET /api/technicians/:id
async function getTechnicianById(req, res) {
  try {
    const technician = await Technician.findById(req.params.id);
    if (!technician) return res.status(404).json({ message: "Technician not found" });
    
    // Add SAS tokens to sensitive documents
    const technicianWithSAS = addSASToTechnician(technician);
    
    res.json({ technician: technicianWithSAS });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch technician", error: err.message });
  }
}

// PUT /api/technicians/:id
async function updateTechnician(req, res) {
  try {
    const technicianId = req.params.id;
    const updateData = {};

    // Handle text fields from FormData
    if (req.body.firstName) updateData.firstName = req.body.firstName;
    if (req.body.lastName) updateData.lastName = req.body.lastName;
    if (req.body.email) updateData.email = req.body.email;
    if (req.body.phone) updateData.phone = req.body.phone;
    if (req.body.password) {
      updateData.password = looksHashed(req.body.password)
        ? req.body.password
        : await bcrypt.hash(req.body.password, 10);
    }
    
    // Handle expertise array from FormData
    if (req.body.expertise) {
      // FormData can send multiple values with same key, multer puts them in an array
      updateData.expertise = Array.isArray(req.body.expertise) 
        ? req.body.expertise 
        : [req.body.expertise];
    }

    // Handle file uploads
    if (req.files) {
      for (const [field, files] of Object.entries(req.files)) {
        if (files && files[0]) {
          const file = files[0];
          const ext = file.originalname.split(".").pop();
          const blobName = `technician-docs/${technicianId}_${field}_${Date.now()}.${ext}`;
          updateData[field] = await uploadBufferToAzure(file.buffer, blobName, file.mimetype);
        }
      }
    }

    // Handle date fields
    if (req.body.workPermitExpiration) {
      updateData.workPermitExpiration = req.body.workPermitExpiration;
    }
    if (req.body.drivingLicenseExpiration) {
      updateData.drivingLicenseExpiration = req.body.drivingLicenseExpiration;
    }

    // Application / availability status (JSON approve/reject flow)
    if (req.body.applicationStatus) {
      updateData.applicationStatus = req.body.applicationStatus;
    }
    if (req.body.rejectionReason !== undefined) {
      updateData.rejectionReason = req.body.rejectionReason;
    }
    if (req.body.currentStatus) {
      updateData.currentStatus = req.body.currentStatus;
    }
    if (req.body.isActive !== undefined) {
      updateData.isActive =
        req.body.isActive === true ||
        req.body.isActive === "true" ||
        req.body.isActive === "1";
    }
    if (req.body.assignedVehicle !== undefined) {
      updateData.assignedVehicle = req.body.assignedVehicle || null;
    }

    const technician = await Technician.findByIdAndUpdate(
      technicianId,
      updateData,
      { new: true, runValidators: false }
    );
    
    if (!technician) return res.status(404).json({ message: "Technician not found" });
    res.json({ technician });
  } catch (err) {
    res.status(500).json({ message: "Failed to update technician", error: err.message });
  }
}

// DELETE /api/technicians/:id
async function deleteTechnician(req, res) {
  try {
    const technician = await Technician.findByIdAndDelete(req.params.id);
    if (!technician) return res.status(404).json({ message: "Technician not found" });
    res.json({ message: "Technician deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete technician", error: err.message });
  }
}

// POST /api/technicians/:id/upload-documents
async function uploadDocuments(req, res) {
  try {
    const technicianId = req.params.id;
    if (!req.files) return res.status(400).json({ message: "No files uploaded" });

    const urls = {};
    for (const [field, file] of Object.entries(req.files)) {
      const ext = file[0].originalname.split(".").pop();
      const blobName = `technician-docs/${technicianId}_${field}_${Date.now()}.${ext}`;
      urls[field] = await uploadBufferToAzure(file[0].buffer, blobName, file[0].mimetype);
    }

    // Add expiry dates if provided
    const updateData = { ...urls };
    if (req.body.workPermitExpiration) {
      updateData.workPermitExpiration = req.body.workPermitExpiration;
    }
    if (req.body.drivingLicenseExpiration) {
      updateData.drivingLicenseExpiration = req.body.drivingLicenseExpiration;
    }

    const technician = await Technician.findByIdAndUpdate(
      technicianId,
      updateData,
      { new: true }
    );
    if (!technician) return res.status(404).json({ message: "Technician not found" });

    res.json({ documentUrls: urls, technician });
  } catch (err) {
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
}

// GET /api/technicians/:id/performance
async function getPerformance(req, res) {
  try {
    const technician = await Technician.findById(req.params.id);
    if (!technician) return res.status(404).json({ message: "Technician not found" });
    res.json({ performance: technician.performance });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch performance", error: err.message });
  }
}

async function toggleActiveStatus(req, res) {
  try {
    const technician = await Technician.findById(req.params.id);
    if (!technician) return res.status(404).json({ message: "Technician not found" });
    technician.isActive = !technician.isActive;
    await technician.save();
    res.json({ technician });
  } catch (err) {
    res.status(500).json({ message: "Failed to toggle active status", error: err.message });
  }
}

// GET /api/technicians/:id/stats - Get technician job statistics
async function getTechnicianStats(req, res) {
  try {
    const { id } = req.params;
    
    // Get earnings data
    const earnings = await TechnicianEarnings.findOne({ technician_id: id });
    
    // Get job counts with correct field names
    const completedJobs = await Job.countDocuments({ 
      assignedTechnician: id, 
      job_status: "completed"
    });
    
    const ongoingJobs = await Job.countDocuments({ 
      assignedTechnician: id, 
      job_status: { $in: ["assigned", "accepted", "en_route", "arrived", "in_progress"] } 
    });
    
    // Get assigned vehicle count
    const assignedVehicles = await Vehicle.countDocuments({ assignedTechnician: id });
    
    // Calculate total earnings from completed jobs
    const completedJobsData = await Job.find({ 
      assignedTechnician: id, 
      job_status: "completed"
    }).select("price");
    
    const totalPrice = completedJobsData.reduce((sum, job) => sum + (job.price || 0), 0);
    
    // Job model has no cost field yet — profit equals gross earnings
    const totalCost = 0;
    const totalProfit = totalPrice;
    
    res.json({
      stats: {
        totalCompletedJobs: completedJobs,
        ongoingJobs: ongoingJobs,
        assignedVehicles: assignedVehicles,
        totalCost: `QR ${totalCost.toLocaleString()}`,
        totalPrice: `QR ${totalPrice.toLocaleString()}`,
        totalProfit: `QR ${totalProfit.toLocaleString()}`,
        cashBalance: earnings?.cash_balance || 0
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch technician stats", error: err.message });
  }
}

// GET /api/technicians/:id/recent-jobs - Get recent jobs
async function getRecentJobs(req, res) {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;
    
    const jobs = await Job.find({ assignedTechnician: id })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('customer_id', 'firstName lastName')
      .populate('customer_vehicle_id');
    
    const formattedJobs = jobs.map(job => {
      // Map job_status to display status
      let displayStatus = 'Ongoing';
      if (job.job_status === 'completed') {
        displayStatus = 'Completed';
      } else if (job.job_status === 'pending') {
        displayStatus = 'Pending';
      }
      
      return {
        id: job._id.toString().slice(-8).toUpperCase(),
        date: job.dateTime || job.createdAt,
        status: displayStatus,
        location: job.location || 'Unknown',
        price: `QR ${job.price || 0}`,
        cost: `QR 0`, // Placeholder since cost not in Job model
        profit: job.price || 0
      };
    });
    
    res.json({ jobs: formattedJobs });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch recent jobs", error: err.message });
  }
}

// GET /api/technicians/:id/settlements - Get balance settlements
async function getSettlements(req, res) {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;
    
    // Get receipts for settled balances
    const receipts = await Receipt.find({ 
      technician_id: id,
      payment_status: 'confirmed'
    })
      .sort({ issued_at: -1 })
      .limit(Number(limit));
    
    const settlements = receipts.map(receipt => ({
      date: receipt.issued_at,
      amount: `QR ${receipt.total_amount.toLocaleString()}`,
      receipt: receipt._id
    }));
    
    res.json({ settlements });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch settlements", error: err.message });
  }
}

// POST /api/technicians/:id/settle-balance - Create settlement
async function settleBalance(req, res) {
  try {
    const { id } = req.params;
    const { amount, notes } = req.body;
    
    // Get technician earnings
    const earnings = await TechnicianEarnings.findOne({ technician_id: id });
    if (!earnings) {
      return res.status(404).json({ message: "Earnings record not found" });
    }
    
    if (earnings.cash_balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }
    
    // Create receipt for settlement
    const receipt = await Receipt.create({
      technician_id: id,
      customer_id: id, // Using technician as customer for settlements
      job_id: null, // No job associated with settlements
      total_amount: amount,
      payment_status: 'confirmed',
      notes: notes || 'Cash balance settlement',
      issued_at: new Date()
    });
    
    // Update cash balance
    earnings.cash_balance -= amount;
    await earnings.save();
    
    res.json({ 
      message: "Balance settled successfully",
      receipt,
      newBalance: earnings.cash_balance
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to settle balance", error: err.message });
  }
}

// PATCH /api/technicians/:id/assign-vehicle
async function assignVehicle(req, res) {
  try {
    const { id } = req.params;
    const { vehicleId } = req.body;
    
    const technician = await Technician.findById(id);
    if (!technician) {
      return res.status(404).json({ message: "Technician not found" });
    }

    const Vehicle = require("../models/Vehicle");
    
    // Unassign current vehicle if technician has one
    if (technician.assignedVehicle) {
      await Vehicle.findByIdAndUpdate(technician.assignedVehicle, { assignedTechnician: null });
    }
    
    // Handle unassignment (null or empty vehicleId)
    if (!vehicleId || vehicleId === "null" || vehicleId === "") {
      await Technician.findByIdAndUpdate(
        id,
        { assignedVehicle: null },
        { new: true, runValidators: false }
      );
      const updatedTech = await Technician.findById(id).populate('assignedVehicle');
      return res.json({ technician: updatedTech });
    }
    
    // Check if vehicle is already assigned to another technician
    const existingAssignment = await Technician.findOne({ 
      assignedVehicle: vehicleId,
      _id: { $ne: id }
    });
    
    if (existingAssignment) {
      return res.status(409).json({ 
        message: "Vehicle is already assigned to another technician",
        assignedTo: `${existingAssignment.firstName} ${existingAssignment.lastName}`,
        technicianId: existingAssignment._id
      });
    }
    
    // Also check and clear vehicle's assignedTechnician if it exists
    const vehicle = await Vehicle.findById(vehicleId);
    if (vehicle && vehicle.assignedTechnician && vehicle.assignedTechnician.toString() !== id) {
      // Clear the vehicle's previous technician assignment
      await Vehicle.findByIdAndUpdate(vehicleId, { assignedTechnician: null });
    }
    
    // Assign new vehicle to technician
    await Technician.findByIdAndUpdate(
      id,
      { assignedVehicle: vehicleId },
      { new: true, runValidators: false }
    );
    
    // Update the vehicle to assign this technician
    await Vehicle.findByIdAndUpdate(vehicleId, { assignedTechnician: id });
    
    const updatedTech = await Technician.findById(id).populate('assignedVehicle');
    res.json({ technician: updatedTech });
  } catch (err) {
    res.status(500).json({ message: "Failed to assign vehicle", error: err.message });
  }
}

module.exports = {
  getTechnicians,
  getLiveMapTechnicians,
  createTechnician,
  getTechnicianById,
  updateTechnician,
  deleteTechnician,
  uploadDocuments,
  getPerformance,
  toggleActiveStatus,
  getTechnicianStats,
  getRecentJobs,
  getSettlements,
  settleBalance,
  assignVehicle
};
