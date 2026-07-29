const { TermsAndConditions } = require("../../../clicks-shared/models");

// GET /api/terms-and-conditions
async function getTermsAndConditions(req, res) {
  try {
    const terms = await TermsAndConditions.find().sort({ createdAt: -1 });
    res.json({ terms });
  } catch (err) {
    res.status(500).json({ error: "Fetch terms and conditions failed", details: err.message });
  }
}

// GET /api/terms-and-conditions/active
async function getActiveTermsAndConditions(req, res) {
  try {
    const terms = await TermsAndConditions.findOne({ isActive: true }).sort({ createdAt: -1 });
    if (!terms) {
      return res.status(404).json({ error: "No active terms and conditions found" });
    }
    res.json({ terms });
  } catch (err) {
    res.status(500).json({ error: "Fetch active terms and conditions failed", details: err.message });
  }
}

// POST /api/terms-and-conditions
async function createTermsAndConditions(req, res) {
  try {
    const { content, version, effectiveDate, isActive } = req.body;
    
    if (!content || !version || !effectiveDate) {
      return res.status(400).json({ error: "Content, version, and effective date are required" });
    }
    
    // If making this terms active, deactivate all others
    if (isActive) {
      await TermsAndConditions.updateMany({}, { isActive: false });
    }
    
    const terms = new TermsAndConditions({
      content,
      version,
      effectiveDate,
      isActive: isActive !== false
    });
    
    await terms.save();
    res.status(201).json({ message: "Terms and conditions created successfully", terms });
  } catch (err) {
    res.status(500).json({ error: "Create terms and conditions failed", details: err.message });
  }
}

// PUT /api/terms-and-conditions/:id
async function updateTermsAndConditions(req, res) {
  try {
    const { content, version, effectiveDate, isActive } = req.body;
    
    // If making this terms active, deactivate all others
    if (isActive) {
      await TermsAndConditions.updateMany({ _id: { $ne: req.params.id } }, { isActive: false });
    }
    
    const terms = await TermsAndConditions.findByIdAndUpdate(
      req.params.id,
      { content, version, effectiveDate, isActive },
      { new: true, runValidators: true }
    );
    
    if (!terms) {
      return res.status(404).json({ error: "Terms and conditions not found" });
    }
    
    res.json({ message: "Terms and conditions updated successfully", terms });
  } catch (err) {
    res.status(500).json({ error: "Update terms and conditions failed", details: err.message });
  }
}

// DELETE /api/terms-and-conditions/:id
async function deleteTermsAndConditions(req, res) {
  try {
    const terms = await TermsAndConditions.findByIdAndDelete(req.params.id);
    
    if (!terms) {
      return res.status(404).json({ error: "Terms and conditions not found" });
    }
    
    res.json({ message: "Terms and conditions deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Delete terms and conditions failed", details: err.message });
  }
}

module.exports = {
  getTermsAndConditions,
  getActiveTermsAndConditions,
  createTermsAndConditions,
  updateTermsAndConditions,
  deleteTermsAndConditions
};
