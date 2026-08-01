const { RepairProcedure } = require("../../../clicks-shared/models");

const fileUploadService = require("../services/fileUploadService");

const createRepairProcedure = async (req, res) => {
  try {
    const {
      job_id,
      technician_id,
      description,
      quantity,
      price,
      name,
      notes,
      cost,
    } = req.body;

    // Check if receipt image is provided
    if (!req.file && !req.body.receipt_image_url) {
      return res.status(400).json({
        error: "Receipt image is required",
        message: "Please upload a receipt image for this repair procedure",
      });
    }

    let receipt_image_url = req.body.receipt_image_url;
    if (req.file) {
      const filename = `receipt-images/${Date.now()}_${req.file.originalname}`;
      receipt_image_url = await fileUploadService.uploadFile(req.file, filename);
    }

    const repair = new RepairProcedure({
      job_id,
      technician_id,
      description,
      quantity,
      price,
      name: name != null ? String(name).trim() : "",
      notes: notes != null ? String(notes).trim() : "",
      cost: cost != null && cost !== "" ? Number(cost) : 0,
      receipt_image_url,
    });
    await repair.save();
    res.status(201).json({ message: "Repair procedure created", repair });
  } catch (err) {
    res.status(500).json({ error: "Create repair procedure failed", details: err.message });
  }
};

const getRepairProcedures = async (req, res) => {
  try {
    const { job_id } = req.query;
    const repairs = await RepairProcedure.find(job_id ? { job_id } : {});
    res.json({ repairs });
  } catch (err) {
    res.status(500).json({ error: "Fetch repair procedures failed", details: err.message });
  }
};

const updateRepairProcedure = async (req, res) => {
  try {
    const { id } = req.params;
    const update = { ...req.body };
    if (update.name != null) update.name = String(update.name).trim();
    if (update.notes != null) update.notes = String(update.notes).trim();
    if (update.cost != null && update.cost !== "") update.cost = Number(update.cost);
    const repair = await RepairProcedure.findByIdAndUpdate(id, update, { new: true });
    if (!repair) return res.status(404).json({ error: "Repair procedure not found" });
    res.json({ message: "Repair procedure updated", repair });
  } catch (err) {
    res.status(500).json({ error: "Update repair procedure failed", details: err.message });
  }
};

const deleteRepairProcedure = async (req, res) => {
  try {
    const { id } = req.params;
    const repair = await RepairProcedure.findByIdAndDelete(id);
    if (!repair) return res.status(404).json({ error: "Repair procedure not found" });
    res.json({ message: "Repair procedure deleted" });
  } catch (err) {
    res.status(500).json({ error: "Delete repair procedure failed", details: err.message });
  }
};

module.exports = {
  createRepairProcedure,
  getRepairProcedures,
  updateRepairProcedure,
  deleteRepairProcedure,
};
