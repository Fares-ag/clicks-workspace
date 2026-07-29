const { ContactUs } = require("../../../clicks-shared/models");

const createContactUsRequest = async (req, res) => {
  try {
    const { issue, description } = req.body;
    const customer_id = req.user.id;

    if (!issue || !description) {
      return res.status(400).json({ error: "Issue and description are required" });
    }

    const contactUs = new ContactUs({
      customer_id,
      issue,
      description
    });

    await contactUs.save();

    res.status(201).json({ 
      message: "Contact request submitted successfully", 
      contactUs 
    });
  } catch (err) {
    res.status(500).json({ 
      error: "Failed to submit contact request", 
      details: err.message 
    });
  }
};

const getContactUsRequests = async (req, res) => {
  try {
    const customer_id = req.user.id;
    const requests = await ContactUs.find({ customer_id }).sort({ createdAt: -1 });
    
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ 
      error: "Failed to fetch contact requests", 
      details: err.message 
    });
  }
};

module.exports = {
  createContactUsRequest,
  getContactUsRequests
};
