/**
 * Contact Us / support tickets for ops (scenario 100).
 *
 * Before this the admin API had no contact-us endpoint at all: customer
 * complaints were saved and nobody at Clicks could read them.
 */
const { postToTechApi } = require("../utils/techApiNotify");
const ContactUs = require("../../../clicks-shared/models/ContactUs");
const Customer = require("../../../clicks-shared/models/Customer");
const Admin = require("../../../clicks-shared/models/Admin");
const {
  CONTACT_US_CATEGORIES,
  CONTACT_US_CATEGORY_CODES,
  CONTACT_US_STATUSES,
  categoryCodeFor,
} = require("../../../clicks-shared/constants/contactUsCategories");
const { str, objectId } = require("../../../clicks-shared/utils/coerce");
const { capAdminLimit } = require("../../../clicks-shared/utils/adminListLimit");
const { escapeRegex } = require("../../../clicks-shared/utils/escapeRegex");
const { recordAudit } = require("../utils/auditLog");

function serialize(row) {
  const customer = row.customer_id && typeof row.customer_id === "object" ? row.customer_id : null;
  const category = row.category || categoryCodeFor(row.issue);
  return {
    _id: row._id,
    id: row._id,
    ticket_number: row.ticket_number || null,
    category,
    category_label: CONTACT_US_CATEGORIES[category]?.en || row.issue,
    issue: row.issue,
    description: row.description,
    status: row.status,
    job_id: row.job_id || null,
    assigned_to: row.assigned_to || null,
    customer: customer
      ? {
          id: customer._id,
          name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
          phone_number: customer.phone_number,
          email: customer.email,
          client_id: customer.client_id,
        }
      : null,
    customer_id: customer ? customer._id : row.customer_id,
    replies: row.replies || [],
    reply_count: (row.replies || []).length,
    last_reply_at: row.last_reply_at || null,
    resolved_at: row.resolved_at || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const CUSTOMER_FIELDS = "first_name last_name phone_number email client_id";

function notifyCustomer(ticketId, kind, message) {
  return postToTechApi("/api/contact-us/internal/notify", {
    ticket_id: String(ticketId),
    kind,
    message,
  });
}

// GET /api/contact-us?status=&category=&search=&page=&limit=
async function listTickets(req, res) {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = capAdminLimit(req.query.limit, 20, 100);
    const filter = {};
    const status = str(req.query.status, { maxLength: 32 });
    if (status && status !== "all") {
      if (!CONTACT_US_STATUSES.includes(status)) {
        return res.status(400).json({ message: "Invalid status", code: "INVALID_STATUS" });
      }
      filter.status = status;
    }
    const category = str(req.query.category, { maxLength: 64 });
    if (category && category !== "all") {
      if (!CONTACT_US_CATEGORY_CODES.includes(category)) {
        return res.status(400).json({ message: "Invalid category", code: "INVALID_CATEGORY" });
      }
      filter.category = category;
    }
    const search = str(req.query.search, { maxLength: 64 }).trim();
    if (search) {
      const or = [{ ticket_number: new RegExp(`^${escapeRegex(search.toUpperCase())}`) }];
      const digits = search.replace(/\D/g, "");
      if (digits.length >= 4) {
        const customers = await Customer.find({ search_phone: new RegExp(`^${digits}|${digits}$`) })
          .select("_id")
          .limit(50)
          .lean();
        if (customers.length) or.push({ customer_id: { $in: customers.map((c) => c._id) } });
      }
      filter.$or = or;
    }

    const [rows, total] = await Promise.all([
      ContactUs.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("customer_id", CUSTOMER_FIELDS)
        .lean(),
      ContactUs.countDocuments(filter),
    ]);
    res.json({ tickets: rows.map(serialize), total, page, limit });
  } catch (err) {
    console.error("listTickets failed:", err.message);
    res.status(500).json({ message: "Failed to fetch support tickets" });
  }
}

// GET /api/contact-us/:id
async function getTicket(req, res) {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(404).json({ message: "Ticket not found" });
    const row = await ContactUs.findById(id).populate("customer_id", CUSTOMER_FIELDS).lean();
    if (!row) return res.status(404).json({ message: "Ticket not found" });
    res.json({ ticket: serialize(row) });
  } catch (err) {
    console.error("getTicket failed:", err.message);
    res.status(500).json({ message: "Failed to fetch support ticket" });
  }
}

// PATCH /api/contact-us/:id  { status?, assigned_to? }
async function updateTicket(req, res) {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(404).json({ message: "Ticket not found" });
    const ticket = await ContactUs.findById(id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const changes = {};
    if (req.body?.status !== undefined) {
      const status = str(req.body.status, { maxLength: 32 });
      if (!CONTACT_US_STATUSES.includes(status)) {
        return res.status(400).json({ message: "Invalid status", code: "INVALID_STATUS" });
      }
      if (status !== ticket.status) {
        changes.status = { from: ticket.status, to: status };
        ticket.status = status;
        ticket.resolved_at = ["resolved", "closed"].includes(status) ? new Date() : null;
      }
    }
    if (req.body?.assigned_to !== undefined) {
      const raw = req.body.assigned_to;
      const assignee = raw === null || raw === "" ? null : objectId(raw);
      if (raw !== null && raw !== "" && !assignee) {
        return res.status(400).json({ message: "Invalid assignee", code: "INVALID_ASSIGNEE" });
      }
      if (assignee && !(await Admin.exists({ _id: assignee, isActive: true }))) {
        return res.status(400).json({ message: "Unknown assignee", code: "INVALID_ASSIGNEE" });
      }
      changes.assigned_to = { from: ticket.assigned_to, to: assignee };
      ticket.assigned_to = assignee;
    }
    if (!Object.keys(changes).length) {
      return res.status(400).json({ message: "Nothing to update", code: "NOTHING_TO_UPDATE" });
    }
    await ticket.save();
    await recordAudit({
      req,
      action: "contact_us.update",
      entityType: "ContactUs",
      entityId: ticket._id,
      changes,
    });
    if (changes.status) await notifyCustomer(ticket._id, "status");
    const row = await ContactUs.findById(id).populate("customer_id", CUSTOMER_FIELDS).lean();
    res.json({ ticket: serialize(row) });
  } catch (err) {
    console.error("updateTicket failed:", err.message);
    res.status(500).json({ message: "Failed to update support ticket" });
  }
}

// POST /api/contact-us/:id/replies  { message, status? }
async function addReply(req, res) {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(404).json({ message: "Ticket not found" });
    const message = str(req.body?.message, { maxLength: 4000 }).trim();
    if (!message) {
      return res.status(400).json({ message: "Reply message is required", code: "REPLY_REQUIRED" });
    }
    const ticket = await ContactUs.findById(id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const admin = await Admin.findById(req.user.id).select("firstName lastName").lean();
    const now = new Date();
    ticket.replies.push({
      author_type: "admin",
      author_id: req.user.id,
      author_name: admin ? `${admin.firstName || ""} ${admin.lastName || ""}`.trim() : "",
      message,
      created_at: now,
    });
    ticket.last_reply_at = now;
    if (ticket.status === "pending") ticket.status = "in_progress";
    const status = str(req.body?.status, { maxLength: 32 });
    if (status && CONTACT_US_STATUSES.includes(status)) {
      ticket.status = status;
      ticket.resolved_at = ["resolved", "closed"].includes(status) ? now : null;
    }
    await ticket.save();
    await recordAudit({
      req,
      action: "contact_us.reply",
      entityType: "ContactUs",
      entityId: ticket._id,
      changes: { reply: { to: message.slice(0, 500) }, status: { to: ticket.status } },
    });
    await notifyCustomer(ticket._id, "reply", message);
    const row = await ContactUs.findById(id).populate("customer_id", CUSTOMER_FIELDS).lean();
    res.status(201).json({ ticket: serialize(row) });
  } catch (err) {
    console.error("addReply failed:", err.message);
    res.status(500).json({ message: "Failed to add reply" });
  }
}

module.exports = { listTickets, getTicket, updateTicket, addReply, serialize };
