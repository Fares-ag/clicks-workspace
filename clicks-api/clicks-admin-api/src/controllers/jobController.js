const Job = require("../models/Job");
const Technician = require("../models/Technician");
const Source = require("../models/Source");
const SOSRequest = require("../models/SOSRequest");
const ServiceRequest = require("../models/ServiceRequest");
const axios = require('axios');
const xlsx = require("xlsx");
const {
  mapHistoricalRow,
  importHistoricalJobs,
} = require("../../../clicks-shared/utils/historicalJobImport");
const {
  parseJobLocationToGeoPoint,
} = require("../../../clicks-shared/utils/parseJobLocation");

// GET /api/jobs
async function getJobs(req, res) {
  try {
    const { page = 1, limit = 10, search = "", status } = req.query;
    
    // Build search query
    let query = {};
    
    if (search) {
      query.$or = [
        { clientName: { $regex: search, $options: "i" } },
        { clientMobileNumber: { $regex: search, $options: "i" } },
        { issue: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
        { businessName: { $regex: search, $options: "i" } },
      ];
    }
    
    // Add status filter
    if (status) {
      query.job_status = status;
    }
    
    const jobs = await Job.find(query)
      .populate("assignedTechnician")
      .populate("source")
      .populate({
        path: "customer_vehicle_id",
        populate: [
          { path: "vehicle_make", select: "makeName" },
          { path: "vehicle_model", select: "modelName" },
        ],
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Job.countDocuments(query);
    res.json({ jobs, total });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch jobs", error: err.message });
  }
}

// POST /api/jobs
async function createJob(req, res) {
  try {
    const {
      customer_id,
      customer_vehicle_id,
      clientName,
      clientMobileNumber,
      clientEmail,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      licensePlate,
      vinNumber,
      issue,
      location,
      dateTime,
      jobType,
      assignedTechnician,
      price,
      source,
      subSource,
      job_status,
      sos_request_id,
      service_request_id,
      business_id,
      businessName,
      businessCutType,
      businessCutPercent,
    } = req.body;
    
    // Validate required fields (technician is now optional)
    if (!clientName || !clientMobileNumber || !location || !dateTime || !jobType || !price || !source) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (!issue || !String(issue).trim()) {
      return res.status(400).json({ message: "Issue description is mandatory" });
    }

    // Determine job status based on technician assignment
    // If technician assigned → "assigned", otherwise → "pending"
    let finalStatus = job_status;
    if (!finalStatus) {
      finalStatus = assignedTechnician ? "assigned" : "pending";
    }

    // Create job with all provided data
    const jobData = {
      customer_id: customer_id || null,
      customer_vehicle_id: customer_vehicle_id || null,
      clientName,
      clientMobileNumber,
      clientEmail: clientEmail || "",
      vehicleMake: vehicleMake || "",
      vehicleModel: vehicleModel || "",
      vehicleYear: vehicleYear != null && vehicleYear !== "" ? Number(vehicleYear) : null,
      licensePlate: licensePlate || "",
      vinNumber: vinNumber || "",
      issue: String(issue).trim(),
      location,
      dateTime,
      jobType,
      assignedTechnician: assignedTechnician || null,
      price,
      source,
      subSource: subSource || "",
      job_status: finalStatus,
      payment_status: "unpaid",
      assigned_at: assignedTechnician ? new Date() : null,
      sos_request_id: sos_request_id || null,
      service_request_id: service_request_id || null,
      business_id: business_id || null,
      businessName: businessName || null,
      businessCutType: businessCutType || undefined,
      businessCutPercent:
        businessCutPercent != null ? Number(businessCutPercent) : undefined,
    };

    const geo = parseJobLocationToGeoPoint(location);
    if (geo) jobData.locationCoordinates = geo;

    const job = await Job.create(jobData);

    // Populate job with technician and customer details
    const populatedJob = await Job.findById(job._id)
      .populate('assignedTechnician', 'firstName lastName phone profilePicture currentLocation')
      .populate('customer_id', 'first_name last_name phone_number');

    // STEP 1: If this is from SOS, update SOS status
    if (sos_request_id) {
      try {
        await SOSRequest.findByIdAndUpdate(sos_request_id, {
          status: 'accepted',
          assigned_technician: assignedTechnician,
          accepted_at: new Date(),
          job_id: job._id
        });
        console.log(`SOS ${sos_request_id} marked as accepted`);
      } catch (sosError) {
        console.error('Error updating SOS:', sosError.message);
      }
    }

    if (service_request_id) {
      try {
        await ServiceRequest.findByIdAndUpdate(service_request_id, {
          status: "assigned",
          job_id: job._id,
        });
        console.log(`ServiceRequest ${service_request_id} marked as assigned`);
      } catch (srError) {
        console.error("Error updating ServiceRequest:", srError.message);
      }
    }

    // STEP 2: Notify technician about the job assignment via Socket.IO (only if assigned)
    if (assignedTechnician) {
      try {
        const customerTechApiUrl = process.env.CUSTOMER_TECH_API_URL || 'http://localhost:5001';
        await axios.post(
          `${customerTechApiUrl}/api/sos/notify-technician`,
          { job_id: job._id.toString() },
          { headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET } }
        );
        console.log(`Technician ${assignedTechnician} notified about job ${job._id}`);
      } catch (notifyError) {
        console.error('Failed to notify technician:', notifyError.message);
      }
    }

    // STEP 3: Send response
    res.status(201).json({ 
      message: "Job created successfully",
      job: populatedJob 
    });

  } catch (err) {
    console.error('Error creating job:', err);
    res.status(500).json({ message: "Failed to create job", error: err.message });
  }
}

// GET /api/jobs/:id
async function getJobById(req, res) {
  try {
    const job = await Job.findById(req.params.id)
      .populate({
        path: "assignedTechnician",
        populate: {
          path: "assignedVehicle",
          populate: [
            { path: "make" },
            { path: "model" }
          ]
        }
      })
      .populate("customer_id")
      .populate({
        path: "customer_vehicle_id",
        populate: [
          { path: "vehicle_make" },
          { path: "vehicle_model" }
        ]
      })
      .populate("source");
    if (!job) return res.status(404).json({ message: "Job not found" });

    const { RepairProcedure, Receipt } = require("../../../clicks-shared/models");
    const { computeJobPricing } = require("../../../clicks-shared/utils/jobPricing");
    const repairs = await RepairProcedure.find({ job_id: job._id })
      .populate("technician_id", "firstName lastName")
      .sort({ created_at: 1 });
    const receipt = await Receipt.findOne({ job_id: job._id }).sort({ issued_at: -1 });
    const pricing = computeJobPricing(job, repairs);

    const { addSASTokenIfNeeded } = require("../utils/sasHelper");
    const jobObj = job.toObject ? job.toObject() : { ...job };
    if (jobObj.customerSignatureUrl) {
      jobObj.customerSignatureUrl = addSASTokenIfNeeded(jobObj.customerSignatureUrl);
    }

    const isPaid = job.payment_status === "paid";
    const financials = {
      currentEstimate: pricing.total,
      totalCost: pricing.costTotal,
      serviceCharge: pricing.serviceCharge,
      currentProfit: pricing.profit,
      dispatcherEstimate: job.estimate ?? null,
      technicianEstimate: job.technician_estimate ?? null,
      isPaid,
      finalPrice: receipt?.total_amount ?? (isPaid ? pricing.total : null),
      basePrice: pricing.basePrice,
      repairsTotal: pricing.repairsTotal,
    };

    res.json({ job: jobObj, repairs, financials });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch job", error: err.message });
  }
}

// PUT /api/jobs/:id
async function updateJob(req, res) {
  try {
    const { assignedTechnician, job_status } = req.body;
    const update = { ...req.body };
    
    // Get the current job to check if technician is being newly assigned
    const currentJob = await Job.findById(req.params.id);
    if (!currentJob) {
      return res.status(404).json({ message: "Job not found" });
    }

    // If technician is being assigned and job was pending, update status to "assigned"
    const isNewTechnicianAssignment = assignedTechnician && 
      !currentJob.assignedTechnician && 
      currentJob.job_status === "pending";
    
    if (isNewTechnicianAssignment) {
      update.job_status = "assigned";
      update.assigned_at = new Date();
    }

    // Handle job cancellation
    const isBeingCancelled = job_status === 'cancelled' && currentJob.job_status !== 'cancelled';
    if (isBeingCancelled) {
      update.cancelled_at = new Date();
      
      // Reset the linked SOS request if exists
      if (currentJob.sos_request_id) {
        await SOSRequest.findByIdAndUpdate(currentJob.sos_request_id, {
          status: 'cancelled'
        });
        console.log(`SOS ${currentJob.sos_request_id} cancelled due to job cancellation`);
      }
      
      // Reset technician status to Online/Available
      if (currentJob.assignedTechnician) {
        await Technician.findByIdAndUpdate(currentJob.assignedTechnician, {
          currentStatus: 'Online'
        });
        console.log(`Technician ${currentJob.assignedTechnician} status reset to Online`);
      }
    }

    // If admin edits customer/vehicle fields after a signature, invalidate it
    const signedFields = [
      "clientName",
      "clientMobileNumber",
      "clientEmail",
      "vehicleMake",
      "vehicleModel",
      "vehicleYear",
      "licensePlate",
      "vinNumber",
      "issue",
      "location",
    ];
    const touchesSigned =
      currentJob.customerSignatureUrl &&
      signedFields.some((f) => Object.prototype.hasOwnProperty.call(req.body, f));
    if (touchesSigned) {
      update.customerSignatureUrl = "";
      update.customerSignedAt = null;
      update.customerSignatureInvalidatedAt = new Date();
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "location")) {
      const geo = parseJobLocationToGeoPoint(req.body.location);
      if (geo) {
        update.locationCoordinates = geo;
      } else {
        update.$unset = { ...(update.$unset || {}), locationCoordinates: 1 };
      }
    }

    // $unset cannot be mixed into findByIdAndUpdate plain update object alongside other fields
    // when using a spread of req.body — handle via separate update if needed.
    let job;
    if (update.$unset) {
      const { $unset, ...setFields } = update;
      job = await Job.findByIdAndUpdate(
        req.params.id,
        { $set: setFields, $unset },
        { new: true }
      )
        .populate('assignedTechnician', 'firstName lastName phone profilePicture')
        .populate('source', 'mainSourceName');
    } else {
      job = await Job.findByIdAndUpdate(req.params.id, update, { new: true })
        .populate('assignedTechnician', 'firstName lastName phone profilePicture')
        .populate('source', 'mainSourceName');
    }

    const becameCompleted =
      job_status === "completed" && currentJob.job_status !== "completed";
    if (becameCompleted) {
      try {
        const { accruePartnerFromCompletedJob } = require("../../../clicks-shared/services/partnerService");
        await accruePartnerFromCompletedJob(job);
      } catch (partnerErr) {
        console.error("Partner accrual failed:", partnerErr.message);
      }
    }
    
    // Notify technician if newly assigned
    if (isNewTechnicianAssignment && assignedTechnician) {
      try {
        const customerTechApiUrl = process.env.CUSTOMER_TECH_API_URL || 'http://localhost:5001';
        await axios.post(
          `${customerTechApiUrl}/api/sos/notify-technician`,
          { job_id: job._id.toString() },
          { headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET } }
        );
        console.log(`Technician ${assignedTechnician} notified about job ${job._id}`);
      } catch (notifyError) {
        console.error('Failed to notify technician:', notifyError.message);
      }
    }

    res.json({ job, signatureCleared: Boolean(touchesSigned) });

  } catch (err) {
    res.status(500).json({ message: "Failed to update job", error: err.message });
  }
}

// DELETE /api/jobs/:id
async function deleteJob(req, res) {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json({ message: "Job deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete job", error: err.message });
  }
}

// GET /api/jobs/:id/repairs
async function getJobRepairs(req, res) {
  try {
    const { RepairProcedure } = require("../../../clicks-shared/models");
    const repairs = await RepairProcedure.find({ job_id: req.params.id })
      .populate('technician_id', 'firstName lastName')
      .sort({ created_at: 1 });
    res.json({ repairs });
  } catch (err) {
    res.status(500).json({ message: "Failed to get repairs", error: err.message });
  }
}

// POST /api/jobs/import — bulk import historical jobs from XLSX
async function importJobs(req, res) {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "No Excel file uploaded. Use form field 'file'." });
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ message: "Excel file has no sheets" });
    }
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    if (!rows.length) {
      return res.status(400).json({ message: "Excel sheet is empty" });
    }

    // Optional preview-only mode (map first N rows without writing)
    if (req.query.preview === "1" || req.query.preview === "true") {
      const previewLimit = Math.min(Number(req.query.limit) || 10, 50);
      const preview = [];
      for (let i = 0; i < Math.min(rows.length, previewLimit); i++) {
        const { doc, error, techName } = mapHistoricalRow(rows[i]);
        preview.push({
          row: i + 2,
          legacy_id: rows[i]?.id ?? null,
          techName,
          error,
          mapped: doc
            ? {
                clientName: doc.clientName,
                clientMobileNumber: doc.clientMobileNumber,
                issue: doc.issue,
                location: doc.location,
                dateTime: doc.dateTime,
                jobType: doc.jobType,
                job_status: doc.job_status,
                price: doc.price,
                payment_method: doc.payment_method || null,
                vehicleModel: doc.vehicleModel,
                licensePlate: doc.licensePlate,
              }
            : null,
        });
      }
      return res.json({ totalRows: rows.length, preview });
    }

    const result = await importHistoricalJobs({
      Job,
      Source,
      Technician,
      rows,
    });

    res.json({
      message: "Import completed",
      totalRows: rows.length,
      imported: result.imported,
      skipped: result.skipped,
      errors: result.errors.slice(0, 100),
      errorCount: result.errors.length,
    });
  } catch (err) {
    console.error("Job import failed:", err);
    res.status(500).json({ message: "Failed to import jobs", error: err.message });
  }
}

module.exports = {
  getJobs,
  createJob,
  getJobById,
  updateJob,
  deleteJob,
  getJobRepairs,
  importJobs,
};
