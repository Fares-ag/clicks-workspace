import React, { useMemo, useState } from "react";
import { useGetAssignmentRosterQuery } from "../store/technicianApi";
import { useReassignJobMutation } from "../store/jobApi";
import { JOB_REASSIGN_REASONS } from "../utils/jobReassign";
import { matchesJobTypeExpertise } from "../constants/jobTypes";
import CustomSelect from "./CustomSelect";
import "./ReassignJobModal.css";

function ReassignJobModal({ open, onClose, job, onSuccess }) {
  const [technicianId, setTechnicianId] = useState("");
  const [reason, setReason] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [search, setSearch] = useState("");
  const [reassignJob, { isLoading }] = useReassignJobMutation();
  const { data: techniciansData } = useGetAssignmentRosterQuery(undefined, {
    skip: !open,
  });

  const currentId = String(
    job?.assignedTechnician?._id || job?.assignedTechnician || ""
  );

  const technicians = useMemo(() => {
    const list = techniciansData?.technicians || [];
    return list.filter((tech) => {
      if (String(tech._id) === currentId) return false;
      const fullName = `${tech.firstName} ${tech.lastName}`.toLowerCase();
      if (!fullName.includes(search.toLowerCase())) return false;
      if (tech.applicationStatus !== "Approved") return false;
      const matchesExpertise = job?.jobType
        ? matchesJobTypeExpertise(job.jobType, tech.expertise || [])
        : true;
      return matchesExpertise;
    });
  }, [techniciansData, currentId, search, job?.jobType]);

  const technicianOptions = technicians.map((tech) => ({
    value: tech._id,
    label: `${tech.firstName} ${tech.lastName} (${tech.currentStatus || "—"})`,
  }));

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!technicianId || !reason) return;
    try {
      await reassignJob({
        id: job._id,
        technician_id: technicianId,
        reason,
        reason_note: reasonNote.trim(),
      }).unwrap();
      onSuccess?.();
      onClose();
      setTechnicianId("");
      setReason("");
      setReasonNote("");
      setSearch("");
    } catch (err) {
      alert(err?.data?.message || "Failed to reassign job");
    }
  };

  const currentName = job?.assignedTechnician
    ? `${job.assignedTechnician.firstName || ""} ${job.assignedTechnician.lastName || ""}`.trim()
    : job?.legacyTechnicianName || "Unknown";

  return (
    <div className="reassign-modal-overlay" onClick={onClose}>
      <div
        className="reassign-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="reassign-modal-title"
      >
        <h2 id="reassign-modal-title" className="reassign-modal-title">
          Reassign technician
        </h2>
        <p className="reassign-modal-subtitle">
          Move this job from <strong>{currentName}</strong> to another technician.
          The job returns to <strong>Assigned</strong> and both technicians are notified.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="reassign-modal-label">New technician</label>
          <input
            type="text"
            className="reassign-modal-search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <CustomSelect
            value={technicianId}
            onChange={setTechnicianId}
            options={technicianOptions}
            placeholder="Select technician"
            searchable
          />

          <label className="reassign-modal-label">Reason</label>
          <CustomSelect
            value={reason}
            onChange={setReason}
            options={JOB_REASSIGN_REASONS}
            placeholder="Select reason"
          />

          <label className="reassign-modal-label">Notes (optional)</label>
          <textarea
            className="reassign-modal-textarea"
            rows={3}
            maxLength={500}
            value={reasonNote}
            onChange={(e) => setReasonNote(e.target.value)}
            placeholder="Short note for dispatch history"
          />

          <div className="reassign-modal-actions">
            <button type="button" className="reassign-modal-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="reassign-modal-submit"
              disabled={isLoading || !technicianId || !reason}
            >
              {isLoading ? "Reassigning…" : "Reassign job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ReassignJobModal;
