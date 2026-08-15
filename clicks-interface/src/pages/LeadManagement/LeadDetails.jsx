import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useGetLeadByIdQuery,
  useUpdateLeadMutation,
  useMarkLeadLostMutation,
} from "../../store/leadApi";
import "../SOSInbox/SOSInbox.css";
import "../JobManagement/AddNewJob.css";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
];

function LeadDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useGetLeadByIdQuery(id);
  const [updateLead, { isLoading: updating }] = useUpdateLeadMutation();
  const [markLost, { isLoading: markingLost }] = useMarkLeadLostMutation();
  const [lostReason, setLostReason] = useState("");
  const [showLostForm, setShowLostForm] = useState(false);

  const lead = data?.lead;
  const isOpen = lead && ["new", "contacted", "qualified"].includes(lead.status);

  const handleStatusChange = async (status) => {
    try {
      await updateLead({ id, status }).unwrap();
      refetch();
    } catch (err) {
      alert(err?.data?.message || "Failed to update status");
    }
  };

  const handleMarkLost = async () => {
    if (!lostReason.trim()) {
      alert("Please enter a reason");
      return;
    }
    try {
      await markLost({ id, lost_reason: lostReason.trim() }).unwrap();
      setShowLostForm(false);
      refetch();
    } catch (err) {
      alert(err?.data?.message || "Failed to mark lead lost");
    }
  };

  if (isLoading) {
    return <div className="sos-inbox-container">Loading lead…</div>;
  }
  if (!lead) {
    return <div className="sos-inbox-container">Lead not found</div>;
  }

  const sourceName =
    typeof lead.source === "object"
      ? lead.source.mainSourceName
      : lead.source;

  return (
    <div className="add-new-job-container">
      <div className="add-new-job-header">
        <button
          type="button"
          className="add-new-job-back"
          onClick={() => navigate("/leads")}
        >
          <img src="/icons/long-arrow-left.svg" alt="Back" />
        </button>
        <h1 className="add-new-job-title">Lead #{String(lead.lead_id || id).slice(-8).toUpperCase()}</h1>
      </div>

      <div className="add-new-job-card" style={{ marginBottom: 24 }}>
        <div className="add-new-job-section">
          <h2 className="add-new-job-section-title">Summary</h2>
          <p><strong>Status:</strong> {lead.status}</p>
          <p><strong>Customer:</strong> {lead.clientName} — {lead.clientMobileNumber}</p>
          {lead.clientEmail && <p><strong>Email:</strong> {lead.clientEmail}</p>}
          <p><strong>Inquiry:</strong> {lead.inquiry}</p>
          {lead.internalNotes && (
            <p><strong>Internal notes:</strong> {lead.internalNotes}</p>
          )}
          <p><strong>Source:</strong> {sourceName}{lead.subSource ? ` / ${lead.subSource}` : ""}</p>
          {lead.location && <p><strong>Location:</strong> {lead.location}</p>}
          {(lead.vehicleMake || lead.vehicleModel) && (
            <p>
              <strong>Vehicle:</strong>{" "}
              {[lead.vehicleYear, lead.vehicleMake, lead.vehicleModel]
                .filter(Boolean)
                .join(" ")}
            </p>
          )}
          {lead.status === "converted" && lead.job_id && (
            <p>
              <strong>Job:</strong>{" "}
              <button
                type="button"
                className="sos-action-btn"
                onClick={() => navigate(`/jobs/${lead.job_id}`)}
              >
                View job
              </button>
            </p>
          )}
          {lead.status === "lost" && lead.lost_reason && (
            <p><strong>Lost reason:</strong> {lead.lost_reason}</p>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="add-new-job-actions" style={{ marginBottom: 24, gap: 12 }}>
          <label>Pipeline status</label>
          <select
            className="sos-inbox-select"
            value={lead.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updating}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="add-new-job-submit"
            onClick={() => navigate(`/leads/${id}/convert`)}
          >
            Convert to Job
          </button>
          <button
            type="button"
            className="add-new-job-cancel"
            onClick={() => setShowLostForm((v) => !v)}
          >
            Mark Lost
          </button>
        </div>
      )}

      {showLostForm && isOpen && (
        <div className="add-new-job-card" style={{ marginBottom: 24 }}>
          <div className="add-new-job-field">
            <label>Lost reason*</label>
            <input
              type="text"
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="e.g. price, no answer, competitor"
            />
          </div>
          <button
            type="button"
            className="add-new-job-submit"
            disabled={markingLost}
            onClick={handleMarkLost}
          >
            Confirm Lost
          </button>
        </div>
      )}
    </div>
  );
}

export default LeadDetails;
