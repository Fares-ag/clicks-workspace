const { SOSRequest, Job, Customer, CustomerVehicle } = require("../../../clicks-shared/models");
const { assertSosAccess } = require("../utils/ownership");

// Get customer's SOS request history
const getSOSRequests = async (req, res) => {
  try {
    const customer_id = req.user.id;
    const requests = await SOSRequest.find({ customer_id })
      .populate("customer_vehicle_id assigned_technician job_id")
      .sort({ createdAt: -1 });
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: "Fetch SOS requests failed", details: err.message });
  }
};

// Get specific SOS request details
const getSOSRequestById = async (req, res) => {
  try {
    const { id } = req.params;
    const sos = await SOSRequest.findById(id)
      .populate("customer_id customer_vehicle_id assigned_technician job_id");
    
    if (!sos) {
      return res.status(404).json({ error: "SOS request not found" });
    }
    if (!assertSosAccess(sos, req.user)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    res.json({ sos });
  } catch (err) {
    res.status(500).json({ error: "Fetch SOS request failed", details: err.message });
  }
};

// Get technician's SOS history
const getTechnicianSOSRequests = async (req, res) => {
  try {
    const technician_id = req.user.id;
    const requests = await SOSRequest.find({ assigned_technician: technician_id })
      .populate("customer_id customer_vehicle_id job_id")
      .sort({ createdAt: -1 });
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: "Fetch technician SOS requests failed", details: err.message });
  }
};

module.exports = {
  getSOSRequests,
  getSOSRequestById,
  getTechnicianSOSRequests
};
