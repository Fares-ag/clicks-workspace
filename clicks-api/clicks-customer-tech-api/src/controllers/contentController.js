const { FAQ, PrivacyPolicy, TermsAndConditions } = require("../../../clicks-shared/models");

// GET /api/content/faqs
const getFAQs = async (req, res) => {
  try {
    const { category } = req.query;
    const query = { isActive: true };
    if (category) query.category = category;
    const faqs = await FAQ.find(query).sort({ order: 1, createdAt: 1 });
    res.json({ faqs });
  } catch (err) {
    res.status(500).json({ error: "Fetch FAQs failed", details: err.message });
  }
};

// GET /api/content/privacy-policy
const getPrivacyPolicy = async (req, res) => {
  try {
    const policy = await PrivacyPolicy.findOne({ isActive: true }).sort({ createdAt: -1 });
    if (!policy) {
      return res.status(404).json({ error: "No privacy policy found" });
    }
    res.json({ policy });
  } catch (err) {
    res.status(500).json({ error: "Fetch privacy policy failed", details: err.message });
  }
};

// GET /api/content/terms-and-conditions
const getTermsAndConditions = async (req, res) => {
  try {
    const terms = await TermsAndConditions.findOne({ isActive: true }).sort({ createdAt: -1 });
    if (!terms) {
      return res.status(404).json({ error: "No terms and conditions found" });
    }
    res.json({ terms });
  } catch (err) {
    res.status(500).json({ error: "Fetch terms and conditions failed", details: err.message });
  }
};

module.exports = {
  getFAQs,
  getPrivacyPolicy,
  getTermsAndConditions
};
