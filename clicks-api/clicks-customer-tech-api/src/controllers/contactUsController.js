const { ContactUs } = require("../../../clicks-shared/models");
const { str, objectId } = require("../../../clicks-shared/utils/coerce");
const {
  CONTACT_US_CATEGORIES,
  categoryCodeFor,
} = require("../../../clicks-shared/constants/contactUsCategories");
const {
  recordAdminNotificationFireAndForget,
} = require("../services/notificationRecordService");
const { sendAdminDispatchPush } = require("../services/fcmService");
const { notifyCustomerSafe } = require("../../../clicks-shared/services/notifyCustomer");

/** Customer-facing view of a ticket (no admin ids). */
function serializeTicket(doc) {
  const row = typeof doc.toObject === "function" ? doc.toObject() : doc;
  return {
    _id: row._id,
    id: row._id,
    ticket_number: row.ticket_number || null,
    category: row.category || categoryCodeFor(row.issue),
    issue: row.issue,
    description: row.description,
    job_id: row.job_id || null,
    status: row.status,
    replies: (row.replies || []).map((r) => ({
      id: r._id,
      author_type: r.author_type,
      author_name: r.author_type === "admin" ? r.author_name || "Clicks Support" : r.author_name,
      message: r.message,
      created_at: r.created_at,
    })),
    last_reply_at: row.last_reply_at || null,
    resolved_at: row.resolved_at || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Support-ticket ack / reply / status change through the one customer
 * notifier: inbox row (awaited) -> socket -> push. `event` is one of
 * supportTicketReceived | supportTicketReply | supportTicketStatus.
 */
async function notifyCustomerTicket(customerId, event, ticket, extra = {}) {
  await notifyCustomerSafe(String(customerId), event, {
    kind: "support_ticket",
    ticket_id: String(ticket._id),
    ticket_number: ticket.ticket_number || "",
    job_id: ticket.job_id ? String(ticket.job_id) : undefined,
    status: ticket.status,
    ...extra,
  });
}

function alertAdminsNewTicket(app, ticket) {
  const payload = {
    ticket_id: String(ticket._id),
    ticket_number: ticket.ticket_number,
    category: ticket.category,
    customer_id: String(ticket.customer_id),
  };
  try {
    const io = app?.get?.("io");
    if (io) io.of("/admin").emit("newSupportTicket", payload);
    recordAdminNotificationFireAndForget({
      type: "support_ticket.new",
      title: `New support request ${ticket.ticket_number}`,
      body: `${CONTACT_US_CATEGORIES[ticket.category]?.en || "Support"}: ${String(
        ticket.description
      ).slice(0, 120)}`,
      data: payload,
    });
    Promise.resolve(
      sendAdminDispatchPush("admin_support_ticket", {
        ...payload,
        title: `New support request ${ticket.ticket_number}`,
        body: CONTACT_US_CATEGORIES[ticket.category]?.en || "Support request",
      })
    ).catch(() => {});
  } catch (err) {
    console.error("[contact-us] admin alert failed:", err.message);
  }
}

const createContactUsRequest = async (req, res) => {
  try {
    const description = str(req.body.description, { maxLength: 4000 }).trim();
    // New builds send `category` (a code); older ones sent the translated
    // label as `issue`. Either maps to a stable code.
    const rawCategory = str(req.body.category, { maxLength: 64 }) || str(req.body.issue, { maxLength: 200 });
    const customer_id = req.user.id;

    if (!rawCategory || !description) {
      return res.status(400).json({
        error: "Issue and description are required",
        code: "CONTACT_US_FIELDS_REQUIRED",
      });
    }

    const category = categoryCodeFor(rawCategory);
    const issue =
      str(req.body.issue, { maxLength: 200 }).trim() ||
      CONTACT_US_CATEGORIES[category]?.en ||
      rawCategory;
    const jobId = objectId(req.body.job_id);

    const contactUs = await ContactUs.create({
      customer_id,
      category,
      issue,
      description,
      job_id: jobId || null,
    });

    await notifyCustomerTicket(customer_id, "supportTicketReceived", contactUs);
    alertAdminsNewTicket(req.app, contactUs);

    res.status(201).json({
      message: "Contact request submitted successfully",
      ticket_number: contactUs.ticket_number,
      contactUs: serializeTicket(contactUs),
    });
  } catch (err) {
    console.error("createContactUsRequest failed:", err.message);
    res.status(500).json({
      error: "Failed to submit contact request",
      code: "CONTACT_US_CREATE_FAILED",
    });
  }
};

const getContactUsRequests = async (req, res) => {
  try {
    const customer_id = req.user.id;
    const requests = await ContactUs.find({ customer_id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ requests: requests.map(serializeTicket) });
  } catch (err) {
    console.error("getContactUsRequests failed:", err.message);
    res.status(500).json({
      error: "Failed to fetch contact requests",
      code: "CONTACT_US_FETCH_FAILED",
    });
  }
};

const getContactUsRequestById = async (req, res) => {
  try {
    const id = objectId(req.params.id);
    if (!id) return res.status(404).json({ error: "Request not found", code: "CONTACT_US_NOT_FOUND" });
    const ticket = await ContactUs.findOne({ _id: id, customer_id: req.user.id }).lean();
    if (!ticket) return res.status(404).json({ error: "Request not found", code: "CONTACT_US_NOT_FOUND" });
    res.json({ request: serializeTicket(ticket) });
  } catch (err) {
    console.error("getContactUsRequestById failed:", err.message);
    res.status(500).json({ error: "Failed to fetch request", code: "CONTACT_US_FETCH_FAILED" });
  }
};

/**
 * Internal (admin-api → tech-api) after an admin replies or changes status:
 * inbox + socket + push to the customer.
 */
const notifyTicketUpdate = async (req, res) => {
  try {
    const id = objectId(req.body?.ticket_id);
    if (!id) return res.status(400).json({ message: "ticket_id is required" });
    const ticket = await ContactUs.findById(id).lean();
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    const kind = str(req.body?.kind, { maxLength: 32 }) === "status" ? "status" : "reply";
    await notifyCustomerTicket(
      ticket.customer_id,
      kind === "reply" ? "supportTicketReply" : "supportTicketStatus",
      ticket,
      kind === "reply" ? { message: str(req.body?.message, { maxLength: 160 }) } : {}
    );
    res.json({ message: "Customer notified" });
  } catch (err) {
    console.error("notifyTicketUpdate failed:", err.message);
    res.status(500).json({ message: "Failed to notify customer" });
  }
};

module.exports = {
  createContactUsRequest,
  getContactUsRequests,
  getContactUsRequestById,
  notifyTicketUpdate,
  serializeTicket,
};
