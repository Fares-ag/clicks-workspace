import React, { useState, useEffect } from "react";
import { useGetJobByIdQuery, useUpdateJobMutation } from "../store/jobApi";
import { useGetOnlineTechniciansQuery } from "../store/technicianApi";
import { useGetSourcesQuery } from "../store/sourceApi";
import CustomSelect from "./CustomSelect.jsx";
import PhoneInput from "./PhoneInput.jsx";
import {
  DEFAULT_COUNTRY_CODE,
  countryCodeFromPhone,
  isValidLocalPhone,
  toE164,
  toLocalDigits,
} from "../utils/phone";
import { isSourceLockedJob, formatJobSourceLabel } from "../utils/jobOrigin.js";
import "./EditJobModal.css";

/** <input type="datetime-local"> speaks local wall-clock time, never UTC. */
function toLocalInputValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function EditJobModal({ open, onClose, jobId, onSuccess }) {
  const [formData, setFormData] = useState({
    clientName: "",
    clientMobileNumber: "",
    countryCode: DEFAULT_COUNTRY_CODE,
    issue: "",
    location: "",
    dateTime: "",
    assignedTechnician: "",
    price: "",
    source: ""
  });

  const { data: jobData } = useGetJobByIdQuery(jobId, { skip: !jobId || !open });
  const [updateJob, { isLoading }] = useUpdateJobMutation();
  const { data: techniciansData } = useGetOnlineTechniciansQuery(undefined, { skip: !open });
  const { data: sourcesData } = useGetSourcesQuery(undefined, { skip: !open });
  
  const onlineTechnicians = techniciansData?.technicians || [];
  const sources = sourcesData?.sources || [];
  const job = jobData?.job;
  const sourceLocked = isSourceLockedJob(job);

  useEffect(() => {
    if (jobData?.job) {
      const job = jobData.job;
      setFormData({
        clientName: job.clientName || "",
        clientMobileNumber: toLocalDigits(
          job.clientMobileNumber || "",
          countryCodeFromPhone(job.clientMobileNumber)
        ),
        countryCode: countryCodeFromPhone(job.clientMobileNumber),
        issue: job.issue || "",
        location: job.location || "",
        dateTime: toLocalInputValue(job.dateTime),
        assignedTechnician: job.assignedTechnician?._id || job.assignedTechnician || "",
        price: job.price || "",
        source: job.source?._id || job.source || ""
      });
    }
  }, [jobData]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValidLocalPhone(formData.clientMobileNumber, formData.countryCode)) {
      alert("Enter a valid local phone number (without the country code)");
      return;
    }
    try {
      const { countryCode, source, ...rest } = formData;
      const payload = {
        id: jobId,
        ...rest,
        clientMobileNumber: toE164(formData.clientMobileNumber, countryCode),
      };
      // The input holds local wall-clock time; send an absolute instant.
      if (formData.dateTime) {
        const parsed = new Date(formData.dateTime);
        if (!Number.isNaN(parsed.getTime())) {
          payload.dateTime = parsed.toISOString();
        }
      }
      if (!sourceLocked) {
        payload.source = source;
      }
      await updateJob(payload).unwrap();
      handleCancel();
      onSuccess?.();
    } catch (error) {
      console.error("Error updating job:", error);
      alert("Failed to update job. Please try again.");
    }
  };

  const handleCancel = () => {
    setFormData({
      clientName: "",
      clientMobileNumber: "",
      countryCode: DEFAULT_COUNTRY_CODE,
      issue: "",
      location: "",
      dateTime: "",
      assignedTechnician: "",
      price: "",
      source: ""
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="edit-job-modal-backdrop">
      <div className="edit-job-modal">
        <button className="edit-job-modal-close" onClick={handleCancel} aria-label="Close">
          <span className="edit-job-modal-close-x">&#10005;</span>
        </button>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="edit-job-modal-header">
            <div className="edit-job-modal-title">Edit Job</div>
            <div className="edit-job-modal-subtitle">Update job details</div>
          </div>
          <div className="edit-job-modal-section">
            <div className="edit-job-modal-section-title">Client Details</div>
            <div className="edit-job-modal-fields">
              <div className="edit-job-modal-row">
                <div className="edit-job-modal-field">
                  <label>Client Name*</label>
                  <input
                    type="text"
                    name="clientName"
                    value={formData.clientName}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="edit-job-modal-field">
                  <label>Client Mobile Number*</label>
                  <PhoneInput
                    name="clientMobileNumber"
                    value={formData.clientMobileNumber}
                    onChange={(digits) =>
                      setFormData((prev) => ({
                        ...prev,
                        clientMobileNumber: digits,
                      }))
                    }
                    countryCode={formData.countryCode}
                    onCountryCodeChange={(code) =>
                      setFormData((prev) => ({
                        ...prev,
                        countryCode: code,
                        clientMobileNumber: toLocalDigits(
                          prev.clientMobileNumber,
                          code
                        ),
                      }))
                    }
                    required
                  />
                </div>
              </div>
              <div className="edit-job-modal-row">
                <div className="edit-job-modal-field" style={{ width: 612 }}>
                  <label>Issue*</label>
                  <textarea
                    name="issue"
                    value={formData.issue}
                    onChange={handleInputChange}
                    className="edit-job-modal-textarea"
                    placeholder="Describe the issue..."
                    required
                  />
                </div>
              </div>
              <div className="edit-job-modal-row">
                <div className="edit-job-modal-field">
                  <label>Location*</label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    placeholder="Job location"
                    required
                  />
                </div>
                <div className="edit-job-modal-field">
                  <label>Date & Time*</label>
                  <input
                    type="datetime-local"
                    name="dateTime"
                    value={formData.dateTime}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
              <div className="edit-job-modal-row">
                <div className="edit-job-modal-field">
                  <label>Assigned Technician</label>
                  <CustomSelect
                    value={formData.assignedTechnician}
                    onChange={(value) => setFormData(prev => ({ ...prev, assignedTechnician: value }))}
                    options={onlineTechnicians.map(tech => ({
                      value: tech._id,
                      label: `${tech.firstName} ${tech.lastName}`
                    }))}
                    placeholder="Select Technician"
                  />
                </div>
              </div>
              <div className="edit-job-modal-row">
                <div className="edit-job-modal-field">
                  <label>Source*</label>
                  {sourceLocked ? (
                    <input
                      type="text"
                      value={formatJobSourceLabel(job)}
                      readOnly
                      disabled
                      title="Source is locked for Technician App and Business Portal jobs"
                    />
                  ) : (
                    <CustomSelect
                      value={formData.source}
                      onChange={(value) => setFormData(prev => ({ ...prev, source: value }))}
                      options={sources.filter(source => source.mainSourceName).map(source => ({
                        value: source._id,
                        label: source.mainSourceName
                      }))}
                      placeholder="Select Source"
                    />
                  )}
                </div>
                <div className="edit-job-modal-field">
                  <label>Price*</label>
                  <input
                    type="number"
                    name="price"
                    value={formData.price}
                    onChange={handleInputChange}
                    placeholder="0"
                    required
                  />
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <button className="edit-job-modal-submit" type="submit">
              Update Job
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditJobModal;
