const { SupportTicket } = require("../../../clicks-shared/models");

const createTicket = async (req, res) => {
  try {
    const { issue_type, description, job_id } = req.body;
    const customer_id = req.user.id;
    if (!issue_type || !description) {
      return res.status(400).json({ error: "Issue type and description required" });
    }
    const ticket = new SupportTicket({
      customer_id,
      job_id,
      issue_type,
      description,
      status: "open"
    });
    await ticket.save();
    res.status(201).json({ message: "Support ticket created", ticket });
  } catch (err) {
    res.status(500).json({ error: "Create ticket failed", details: err.message });
  }
};

const getTickets = async (req, res) => {
  try {
    const customer_id = req.user.id;
    const tickets = await SupportTicket.find({ customer_id });
    res.json({ tickets });
  } catch (err) {
    res.status(500).json({ error: "Fetch tickets failed", details: err.message });
  }
};

const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const update = req.body;
    const ticket = await SupportTicket.findByIdAndUpdate(id, update, { new: true });
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    res.json({ message: "Ticket updated", ticket });
  } catch (err) {
    res.status(500).json({ error: "Update ticket failed", details: err.message });
  }
};

const getTicketTypes = async (req, res) => {
  // Static list for now
  res.json({
    types: [
      "Payment Issue",
      "Job Issue",
      "Technician Issue",
      "Vehicle Issue",
      "Other"
    ]
  });
};

module.exports = {
  createTicket,
  getTickets,
  updateTicket,
  getTicketTypes
};
