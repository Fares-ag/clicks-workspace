import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGetSupportTicketByIdQuery, useUpdateSupportTicketMutation } from "../../store/supportTicketApi";
import "./SupportTickets.css";

const STATUS_COLORS = {
  pending: { bg: "#FEF4E6", color: "#F79009", border: "#FECF85", label: "Pending" },
  in_progress: { bg: "#E8F7FF", color: "#0D6EFD", border: "#B8E6FF", label: "In Progress" },
  resolved: { bg: "#ECFDF5", color: "#12B76A", border: "#A6F4C5", label: "Resolved" }
};

const SOURCE_LABELS = {
  customer_app: "Customer App",
  technician_app: "Technician App",
  public_website: "Website"
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span
      className="ticket-status-badge"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {s.label}
    </span>
  );
}

function TicketDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useGetSupportTicketByIdQuery(id);
  const [updateTicket] = useUpdateSupportTicketMutation();

  const [newStatus, setNewStatus] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [notesInit, setNotesInit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  const ticket = data?.request;

  // Initialize admin notes from ticket data
  if (ticket && !notesInit) {
    setAdminNotes(ticket.admin_notes || "");
    setNewStatus(ticket.status || "pending");
    setNotesInit(true);
  }

  const getSubmitterName = () => {
    if (ticket?.name) return ticket.name;
    if (ticket?.user_id) {
      const u = ticket.user_id;
      const first = u.firstName || u.first_name || "";
      const last = u.lastName || u.last_name || "";
      return `${first} ${last}`.trim() || "—";
    }
    return "—";
  };

  const getSubmitterEmail = () => {
    return ticket?.email || ticket?.user_id?.email || "—";
  };

  const getSubmitterPhone = () => {
    return ticket?.phone || ticket?.user_id?.phone_number || ticket?.user_id?.phone || "—";
  };

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await updateTicket({ id, admin_notes: adminNotes }).unwrap();
      refetch();
    } catch (err) {
      console.error("Failed to save notes:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (newStatus === ticket?.status) return;
    setStatusSaving(true);
    try {
      await updateTicket({ id, status: newStatus }).unwrap();
      refetch();
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setStatusSaving(false);
    }
  };

  if (isLoading) {
    return <div className="ticket-details-loading">Loading ticket details...</div>;
  }

  if (error || !ticket) {
    return <div className="ticket-details-error">Ticket not found or failed to load.</div>;
  }

  return (
    <div className="ticket-details-container">
      {/* Back button */}
      <div className="ticket-details-back-row">
        <button className="ticket-details-back-btn" onClick={() => navigate("/support-tickets")}>
          <img src="/icons/long-arrow-left.svg" alt="Back" />
          <span>Back to Support Tickets</span>
        </button>
      </div>

      {/* Header */}
      <div className="ticket-details-header">
        <div className="ticket-details-title-section">
          <h1 className="ticket-details-title">
            Ticket #{(ticket._id || "").slice(-8).toUpperCase()}
          </h1>
          <div className="ticket-details-meta">
            <StatusBadge status={ticket.status} />
            <span>
              Submitted {new Date(ticket.createdAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </span>
            <span>{SOURCE_LABELS[ticket.source] || ticket.source || "—"}</span>
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="ticket-details-grid">
        {/* Main content */}
        <div className="ticket-details-main">
          <div className="ticket-details-section-title">Issue Type</div>
          <div className="ticket-details-issue">{ticket.issue}</div>

          <div className="ticket-details-section-title">Description</div>
          <div className="ticket-details-description">{ticket.description}</div>

          <hr className="ticket-details-divider" />

          {/* Admin Notes */}
          <div className="ticket-details-section-title">Admin Notes</div>
          <div className="ticket-admin-notes-form">
            <textarea
              className="ticket-admin-notes-textarea"
              placeholder="Add internal notes about this ticket..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
            />
            <div className="ticket-admin-notes-actions">
              <button
                className="ticket-admin-notes-save"
                onClick={handleSaveNotes}
                disabled={saving || adminNotes === (ticket.admin_notes || "")}
              >
                {saving ? "Saving..." : "Save Notes"}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="ticket-details-sidebar">
          {/* Submitter Info */}
          <div className="ticket-details-card">
            <h3>Submitter Information</h3>
            <div className="ticket-info-row">
              <span className="ticket-info-label">Name</span>
              <span className="ticket-info-value">{getSubmitterName()}</span>
            </div>
            <div className="ticket-info-row">
              <span className="ticket-info-label">Email</span>
              <span className="ticket-info-value">{getSubmitterEmail()}</span>
            </div>
            <div className="ticket-info-row">
              <span className="ticket-info-label">Phone</span>
              <span className="ticket-info-value">{getSubmitterPhone()}</span>
            </div>
            <div className="ticket-info-row">
              <span className="ticket-info-label">Source</span>
              <span className="ticket-info-value">{SOURCE_LABELS[ticket.source] || ticket.source || "—"}</span>
            </div>
            {ticket.user_type && (
              <div className="ticket-info-row">
                <span className="ticket-info-label">User Type</span>
                <span className="ticket-info-value">{ticket.user_type}</span>
              </div>
            )}
          </div>

          {/* Status Update */}
          <div className="ticket-details-card">
            <h3>Update Status</h3>
            <select
              className="ticket-status-select"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
            <button
              className="ticket-status-update-btn"
              onClick={handleUpdateStatus}
              disabled={statusSaving || newStatus === ticket.status}
            >
              {statusSaving ? "Updating..." : "Update Status"}
            </button>
          </div>

          {/* Ticket Info */}
          <div className="ticket-details-card">
            <h3>Ticket Information</h3>
            <div className="ticket-info-row">
              <span className="ticket-info-label">Ticket ID</span>
              <span className="ticket-info-value">#{(ticket._id || "").slice(-8).toUpperCase()}</span>
            </div>
            <div className="ticket-info-row">
              <span className="ticket-info-label">Created</span>
              <span className="ticket-info-value">
                {new Date(ticket.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                })}
              </span>
            </div>
            <div className="ticket-info-row">
              <span className="ticket-info-label">Updated</span>
              <span className="ticket-info-value">
                {new Date(ticket.updatedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TicketDetails;
