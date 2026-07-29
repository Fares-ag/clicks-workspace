const { FAQ } = require("../../../clicks-shared/models");

// GET /api/faqs
async function getFAQs(req, res) {
  try {
    const { category } = req.query;
    const query = category ? { category } : {};
    const faqs = await FAQ.find(query).sort({ order: 1, createdAt: 1 });
    res.json({ faqs });
  } catch (err) {
    res.status(500).json({ error: "Fetch FAQs failed", details: err.message });
  }
}

// GET /api/faqs/active
async function getActiveFAQs(req, res) {
  try {
    const { category } = req.query;
    const query = { isActive: true };
    if (category) query.category = category;
    const faqs = await FAQ.find(query).sort({ order: 1, createdAt: 1 });
    res.json({ faqs });
  } catch (err) {
    res.status(500).json({ error: "Fetch active FAQs failed", details: err.message });
  }
}

// POST /api/faqs
async function createFAQ(req, res) {
  try {
    const { question, answer, category, order, isActive } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({ error: "Question and answer are required" });
    }
    
    const faq = new FAQ({
      question,
      answer,
      category,
      order: order || 0,
      isActive: isActive !== false
    });
    
    await faq.save();
    res.status(201).json({ message: "FAQ created successfully", faq });
  } catch (err) {
    res.status(500).json({ error: "Create FAQ failed", details: err.message });
  }
}

// PUT /api/faqs/:id
async function updateFAQ(req, res) {
  try {
    const { question, answer, category, order, isActive } = req.body;
    
    const faq = await FAQ.findByIdAndUpdate(
      req.params.id,
      { question, answer, category, order, isActive },
      { new: true, runValidators: true }
    );
    
    if (!faq) {
      return res.status(404).json({ error: "FAQ not found" });
    }
    
    res.json({ message: "FAQ updated successfully", faq });
  } catch (err) {
    res.status(500).json({ error: "Update FAQ failed", details: err.message });
  }
}

// DELETE /api/faqs/:id
async function deleteFAQ(req, res) {
  try {
    const faq = await FAQ.findByIdAndDelete(req.params.id);
    
    if (!faq) {
      return res.status(404).json({ error: "FAQ not found" });
    }
    
    res.json({ message: "FAQ deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Delete FAQ failed", details: err.message });
  }
}

module.exports = {
  getFAQs,
  getActiveFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ
};
