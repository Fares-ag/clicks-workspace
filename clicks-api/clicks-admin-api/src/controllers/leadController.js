const axios = require("axios");
const Lead = require("../models/Lead");

const OPEN_LEAD_STATUSES =
  Lead.OPEN_LEAD_STATUSES || ["new", "contacted", "qualified"];
const { createJobRecord } = require("../../../clicks-shared/services/createJobRecord");
const { normalizePhoneE164 } = require("../../../clicks-shared/utils/phone");

function mapLead(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  const source =
    o.source && typeof o.source === "object" ? o.source : null;
  return {
    lead_id: o._id.toString(),
    _id: o._id.toString(),
    clientName: o.clientName,
    clientMobileNumber: o.clientMobileNumber,
    clientEmail: o.clientEmail || "",
    inquiry: o.inquiry,
    internalNotes: o.internalNotes || "",
    serviceType: o.serviceType || "",
    timing: o.timing || null,
    preferredDateTime: o.preferredDateTime || null,
    location: o.location || "",
    vehicleMake: o.vehicleMake || "",
    vehicleModel: o.vehicleModel || "",
    vehicleYear: o.vehicleYear,
    licensePlate: o.licensePlate || "",
    vinNumber: o.vinNumber || "",
    source: source
      ? { _id: source._id.toString(), mainSourceName: source.mainSourceName }
      : o.source?.toString?.() || o.source,
    subSource: o.subSource || "",
    customer_id: o.customer_id?.toString?.() || o.customer_id || null,
    customer_vehicle_id:
      o.customer_vehicle_id?.toString?.() || o.customer_vehicle_id || null,
    service_request_id:
      o.service_request_id?.toString?.() || o.service_request_id || null,
    job_id: o.job_id?.toString?.() || o.job_id || null,
    status: o.status,
    lost_reason: o.lost_reason || "",
    converted_at: o.converted_at || null,
    converted_by:
      o.converted_by?.toString?.() || o.converted_by || null,
    assigned_to: o.assigned_to?.toString?.() || o.assigned_to || null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

async function notifyTechnician(jobId) {
  const customerTechApiUrl =
    process.env.CUSTOMER_TECH_API_URL || "http://localhost:5001";
  await axios.post(
    `${customerTechApiUrl}/api/sos/notify-technician`,
    { job_id: jobId },
    { headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET } }
  );
}

async function getLeads(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const status = req.query.status;
    const search = (req.query.search || "").trim();
    const openOnly = req.query.open === "1" || req.query.open === "true";

    const filter = {};
    if (status) {
      filter.status = status;
    } else if (openOnly) {
      filter.status = { $in: OPEN_LEAD_STATUSES };
    }
    if (search) {
      filter.$or = [
        { clientName: { $regex: search, $options: "i" } },
        { clientMobileNumber: { $regex: search, $options: "i" } },
        { inquiry: { $regex: search, $options: "i" } },
      ];
    }

    const [docs, total, openCount] = await Promise.all([
      Lead.find(filter)
        .populate("source", "mainSourceName")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Lead.countDocuments(filter),
      Lead.countDocuments({ status: { $in: OPEN_LEAD_STATUSES } }),
    ]);

    res.json({
      leads: docs.map(mapLead),
      pagination: { page, limit, total },
      openCount,
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch leads",
      error: err.message,
    });
  }
}

async function createLead(req, res) {
  try {
    const {
      clientName,
      clientMobileNumber,
      clientEmail,
      inquiry,
      internalNotes,
      serviceType,
      timing,
      preferredDateTime,
      location,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      licensePlate,
      vinNumber,
      source,
      subSource,
      customer_id,
      customer_vehicle_id,
      service_request_id,
      status,
    } = req.body;

    if (!clientName || !clientMobileNumber || !inquiry || !String(inquiry).trim() || !source) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const allowedStatus = ["new", "contacted", "qualified"];
    const leadStatus = allowedStatus.includes(status) ? status : "new";

    const leadPayload = {
      clientName: String(clientName).trim(),
      clientMobileNumber: normalizePhoneE164(clientMobileNumber),
      clientEmail: clientEmail || "",
      inquiry: String(inquiry).trim(),
      internalNotes: internalNotes || "",
      serviceType: serviceType || "",
      timing: timing === "scheduled" || timing === "immediate" ? timing : undefined,
      preferredDateTime: preferredDateTime || null,
      location: location || "",
      vehicleMake: vehicleMake || "",
      vehicleModel: vehicleModel || "",
      vehicleYear:
        vehicleYear != null && vehicleYear !== "" ? Number(vehicleYear) : null,
      licensePlate: licensePlate || "",
      vinNumber: vinNumber || "",
      source,
      subSource: subSource || "",
      status: leadStatus,
    };
    if (customer_id) leadPayload.customer_id = customer_id;
    if (customer_vehicle_id) leadPayload.customer_vehicle_id = customer_vehicle_id;
    if (service_request_id) leadPayload.service_request_id = service_request_id;

    const lead = await Lead.create(leadPayload);

    const populated = await Lead.findById(lead._id).populate(
      "source",
      "mainSourceName"
    );
    res.status(201).json({
      message: "Lead created",
      lead: mapLead(populated),
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: "A lead already exists for this service request",
      });
    }
    res.status(500).json({ message: "Failed to create lead", error: err.message });
  }
}

async function getLeadById(req, res) {
  try {
    const lead = await Lead.findById(req.params.id).populate(
      "source",
      "mainSourceName"
    );
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }
    res.json({ lead: mapLead(lead) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch lead", error: err.message });
  }
}

async function getLeadByServiceRequest(req, res) {
  try {
    const lead = await Lead.findOne({
      service_request_id: req.params.serviceRequestId,
    }).populate("source", "mainSourceName");
    if (!lead) {
      return res.status(404).json({ message: "Lead not found for service request" });
    }
    res.json({ lead: mapLead(lead) });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch lead", error: err.message });
  }
}

async function updateLead(req, res) {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }
    if (lead.status === "converted" || lead.status === "lost") {
      return res.status(400).json({
        message: `Cannot update a ${lead.status} lead`,
      });
    }

    const allowed = [
      "clientName",
      "clientMobileNumber",
      "clientEmail",
      "inquiry",
      "internalNotes",
      "serviceType",
      "timing",
      "preferredDateTime",
      "location",
      "vehicleMake",
      "vehicleModel",
      "vehicleYear",
      "licensePlate",
      "vinNumber",
      "source",
      "subSource",
      "assigned_to",
      "status",
    ];
    const patch = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        patch[key] = req.body[key];
      }
    }

    if (patch.status && !["new", "contacted", "qualified"].includes(patch.status)) {
      return res.status(400).json({
        message: "Invalid status transition via PATCH",
      });
    }
    if (patch.clientMobileNumber) {
      patch.clientMobileNumber = normalizePhoneE164(patch.clientMobileNumber);
    }
    if (patch.inquiry) {
      patch.inquiry = String(patch.inquiry).trim();
    }
    if (patch.vehicleYear != null && patch.vehicleYear !== "") {
      patch.vehicleYear = Number(patch.vehicleYear);
    }

    Object.assign(lead, patch);
    await lead.save();

    const populated = await Lead.findById(lead._id).populate(
      "source",
      "mainSourceName"
    );
    res.json({ lead: mapLead(populated) });
  } catch (err) {
    res.status(500).json({ message: "Failed to update lead", error: err.message });
  }
}

async function convertLead(req, res) {
  try {
    const lead = await Lead.findById(req.params.id).populate(
      "source",
      "mainSourceName"
    );
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }
    if (lead.status === "converted") {
      return res.status(400).json({ message: "Lead is already converted" });
    }
    if (lead.status === "lost") {
      return res.status(400).json({ message: "Cannot convert a lost lead" });
    }
    if (lead.job_id) {
      return res.status(400).json({ message: "Lead is already linked to a job" });
    }

    const body = { ...req.body };
    body.lead_id = lead._id;
    if (!body.service_request_id && lead.service_request_id) {
      body.service_request_id = lead.service_request_id;
    }
    if (!body.customer_id && lead.customer_id) {
      body.customer_id = lead.customer_id;
    }
    if (!body.customer_vehicle_id && lead.customer_vehicle_id) {
      body.customer_vehicle_id = lead.customer_vehicle_id;
    }
    if (!body.clientName) body.clientName = lead.clientName;
    if (!body.clientMobileNumber) body.clientMobileNumber = lead.clientMobileNumber;
    if (!body.clientEmail) body.clientEmail = lead.clientEmail;
    if (!body.issue) body.issue = lead.inquiry;
    if (!body.location) body.location = lead.location;
    if (!body.source) body.source = lead.source?._id || lead.source;
    if (!body.subSource) body.subSource = lead.subSource;
    if (!body.vehicleMake) body.vehicleMake = lead.vehicleMake;
    if (!body.vehicleModel) body.vehicleModel = lead.vehicleModel;
    if (body.vehicleYear == null && lead.vehicleYear != null) {
      body.vehicleYear = lead.vehicleYear;
    }
    if (!body.licensePlate) body.licensePlate = lead.licensePlate;
    if (!body.vinNumber) body.vinNumber = lead.vinNumber;
    if (!body.dateTime && lead.preferredDateTime) {
      body.dateTime = lead.preferredDateTime;
    }

    const { populatedJob } = await createJobRecord(body, {
      notifyTechnicianFn: notifyTechnician,
    });

    lead.status = "converted";
    lead.job_id = populatedJob._id;
    lead.converted_at = new Date();
    lead.converted_by = req.user?.id || req.user?._id || null;
    await lead.save();

    res.status(201).json({
      message: "Lead converted to job",
      job: populatedJob,
      lead: mapLead(lead),
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: err.message || "Failed to convert lead",
      error: err.message,
    });
  }
}

async function markLeadLost(req, res) {
  try {
    const { lost_reason } = req.body || {};
    if (!lost_reason || !String(lost_reason).trim()) {
      return res.status(400).json({ message: "lost_reason is required" });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }
    if (lead.status === "converted") {
      return res.status(400).json({ message: "Cannot mark a converted lead as lost" });
    }

    lead.status = "lost";
    lead.lost_reason = String(lost_reason).trim();
    await lead.save();

    const populated = await Lead.findById(lead._id).populate(
      "source",
      "mainSourceName"
    );
    res.json({ lead: mapLead(populated) });
  } catch (err) {
    res.status(500).json({ message: "Failed to mark lead lost", error: err.message });
  }
}

module.exports = {
  getLeads,
  createLead,
  getLeadById,
  getLeadByServiceRequest,
  updateLead,
  convertLead,
  markLeadLost,
  mapLead,
};
