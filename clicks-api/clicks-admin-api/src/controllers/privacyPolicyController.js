const { PrivacyPolicy } = require("../../../clicks-shared/models");

// GET /api/privacy-policy
async function getPrivacyPolicies(req, res) {
  try {
    const policies = await PrivacyPolicy.find().sort({ createdAt: -1 });
    res.json({ policies });
  } catch (err) {
    res.status(500).json({ error: "Fetch privacy policies failed", details: err.message });
  }
}

// GET /api/privacy-policy/active
async function getActivePrivacyPolicy(req, res) {
  try {
    const policy = await PrivacyPolicy.findOne({ isActive: true }).sort({ createdAt: -1 });
    if (!policy) {
      return res.status(404).json({ error: "No active privacy policy found" });
    }
    res.json({ policy });
  } catch (err) {
    res.status(500).json({ error: "Fetch active privacy policy failed", details: err.message });
  }
}

// POST /api/privacy-policy
async function createPrivacyPolicy(req, res) {
  try {
    const { content, version, effectiveDate, isActive } = req.body;
    
    if (!content || !version || !effectiveDate) {
      return res.status(400).json({ error: "Content, version, and effective date are required" });
    }
    
    // If making this policy active, deactivate all others
    if (isActive) {
      await PrivacyPolicy.updateMany({}, { isActive: false });
    }
    
    const policy = new PrivacyPolicy({
      content,
      version,
      effectiveDate,
      isActive: isActive !== false
    });
    
    await policy.save();
    res.status(201).json({ message: "Privacy policy created successfully", policy });
  } catch (err) {
    res.status(500).json({ error: "Create privacy policy failed", details: err.message });
  }
}

// PUT /api/privacy-policy/:id
async function updatePrivacyPolicy(req, res) {
  try {
    const { content, version, effectiveDate, isActive } = req.body;
    
    // If making this policy active, deactivate all others
    if (isActive) {
      await PrivacyPolicy.updateMany({ _id: { $ne: req.params.id } }, { isActive: false });
    }
    
    const policy = await PrivacyPolicy.findByIdAndUpdate(
      req.params.id,
      { content, version, effectiveDate, isActive },
      { new: true, runValidators: true }
    );
    
    if (!policy) {
      return res.status(404).json({ error: "Privacy policy not found" });
    }
    
    res.json({ message: "Privacy policy updated successfully", policy });
  } catch (err) {
    res.status(500).json({ error: "Update privacy policy failed", details: err.message });
  }
}

// DELETE /api/privacy-policy/:id
async function deletePrivacyPolicy(req, res) {
  try {
    const policy = await PrivacyPolicy.findByIdAndDelete(req.params.id);
    
    if (!policy) {
      return res.status(404).json({ error: "Privacy policy not found" });
    }
    
    res.json({ message: "Privacy policy deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Delete privacy policy failed", details: err.message });
  }
}

module.exports = {
  getPrivacyPolicies,
  getActivePrivacyPolicy,
  createPrivacyPolicy,
  updatePrivacyPolicy,
  deletePrivacyPolicy
};
