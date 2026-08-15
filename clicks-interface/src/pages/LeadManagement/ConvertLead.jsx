import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useGetLeadByIdQuery,
  useConvertLeadMutation,
} from "../../store/leadApi";
import { useGetTechniciansQuery } from "../../store/technicianApi";
import CustomSelect from "../../components/CustomSelect.jsx";
import DateTimePicker from "../../components/DateTimePicker.jsx";
import { JOB_TYPE_MAPPING, JOB_TYPE_OPTIONS } from "../../constants/jobTypes";
import "../JobManagement/AddNewJob.css";

function ConvertLead() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading: leadLoading } = useGetLeadByIdQuery(id);
  const [convertLead, { isLoading }] = useConvertLeadMutation();
  const { data: techniciansData, refetch: refetchTechnicians } =
    useGetTechniciansQuery({ limit: 100 });

  const lead = data?.lead;
  const [formData, setFormData] = useState({
    location: "",
    dateTime: "",
    jobType: "",
    assignedTechnician: "",
    price: "",
    issue: "",
  });
  const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);
  const dateTimeInputRef = useRef(null);

  const allTechnicians = techniciansData?.technicians || [];
  const jobTypeMapping = JOB_TYPE_MAPPING;

  const availableTechnicians = useMemo(() => {
    return allTechnicians.filter((tech) => {
      const isApproved = tech.applicationStatus === "Approved";
      const isAvailable =
        tech.currentStatus === "Online" || tech.currentStatus === "On Job";
      if (!formData.jobType) return isApproved && isAvailable;
      const requiredExpertise = jobTypeMapping[formData.jobType];
      const techExpertise = tech.expertise || [];
      return (
        isApproved &&
        isAvailable &&
        techExpertise.includes(requiredExpertise)
      );
    });
  }, [allTechnicians, formData.jobType, jobTypeMapping]);

  useEffect(() => {
    if (!lead) return;
    setFormData((prev) => ({
      ...prev,
      location: lead.location || prev.location,
      issue: lead.inquiry || prev.issue,
      dateTime: lead.preferredDateTime
        ? new Date(lead.preferredDateTime).toISOString()
        : prev.dateTime,
      jobType: lead.serviceType || prev.jobType,
    }));
  }, [lead]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.location || !formData.dateTime || !formData.jobType || !formData.price || !formData.issue?.trim()) {
      alert("Please complete all required job fields");
      return;
    }

    try {
      const result = await convertLead({
        id,
        location: formData.location,
        dateTime: formData.dateTime,
        jobType: formData.jobType,
        assignedTechnician: formData.assignedTechnician || undefined,
        price: Number(formData.price),
        issue: formData.issue.trim(),
      }).unwrap();
      const jobId = result?.job?._id || result?.job?.id;
      navigate(jobId ? `/jobs/${jobId}` : "/jobs", {
        state: { successMessage: "Lead converted to job" },
      });
    } catch (error) {
      alert(error?.data?.message || "Failed to convert lead");
    }
  };

  if (leadLoading) {
    return <div className="add-new-job-container">Loading…</div>;
  }
  if (!lead) {
    return <div className="add-new-job-container">Lead not found</div>;
  }
  if (!["new", "contacted", "qualified"].includes(lead.status)) {
    return (
      <div className="add-new-job-container">
        <p>This lead cannot be converted (status: {lead.status}).</p>
        <button type="button" onClick={() => navigate(`/leads/${id}`)}>
          Back to lead
        </button>
      </div>
    );
  }

  return (
    <div className="add-new-job-container">
      <div className="add-new-job-header">
        <button
          type="button"
          className="add-new-job-back"
          onClick={() => navigate(`/leads/${id}`)}
        >
          <img src="/icons/long-arrow-left.svg" alt="Back" />
        </button>
        <h1 className="add-new-job-title">Convert Lead to Job</h1>
      </div>

      <div className="add-new-job-card" style={{ marginBottom: 16 }}>
        <p><strong>{lead.clientName}</strong> — {lead.clientMobileNumber}</p>
        <p>{lead.inquiry}</p>
      </div>

      <form onSubmit={handleSubmit} className="add-new-job-form">
        <div className="add-new-job-card">
          <div className="add-new-job-section">
            <h2 className="add-new-job-section-title">Job Details</h2>
            <div className="add-new-job-row">
              <div className="add-new-job-field">
                <label>Location*</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="add-new-job-field" style={{ position: "relative" }}>
                <label>Date & Time*</label>
                <input
                  ref={dateTimeInputRef}
                  type="text"
                  value={
                    formData.dateTime
                      ? new Date(formData.dateTime).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })
                      : ""
                  }
                  placeholder="Select date and time"
                  onClick={() => setDateTimePickerOpen(!dateTimePickerOpen)}
                  readOnly
                  required
                />
                {dateTimePickerOpen && (
                  <DateTimePicker
                    value={formData.dateTime}
                    onChange={(date) => {
                      setFormData((prev) => ({
                        ...prev,
                        dateTime: date.toISOString(),
                      }));
                      setDateTimePickerOpen(false);
                    }}
                    onClose={() => setDateTimePickerOpen(false)}
                    showTimePicker={true}
                  />
                )}
              </div>
            </div>
            <div className="add-new-job-row">
              <div className="add-new-job-field">
                <label>Type of Job*</label>
                <CustomSelect
                  value={formData.jobType}
                  onChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      jobType: value,
                      assignedTechnician: "",
                    }))
                  }
                  options={JOB_TYPE_OPTIONS.map(({ value, label }) => ({
                    value,
                    label,
                  }))}
                  placeholder="Select Job Type"
                  searchable
                />
              </div>
              <div className="add-new-job-field">
                <label>Assigned Technician</label>
                <CustomSelect
                  value={formData.assignedTechnician}
                  onChange={(value) =>
                    setFormData((prev) => ({ ...prev, assignedTechnician: value }))
                  }
                  options={availableTechnicians.map((tech) => ({
                    value: tech._id,
                    label: `${tech.firstName} ${tech.lastName}`,
                  }))}
                  placeholder={
                    formData.jobType ? "Select Technician" : "Select Job Type First"
                  }
                  disabled={!formData.jobType}
                  searchable
                />
                <button
                  type="button"
                  onClick={() => refetchTechnicians()}
                  style={{ marginTop: 8, fontSize: 12 }}
                >
                  Refresh technicians
                </button>
              </div>
              <div className="add-new-job-field">
                <label>Price*</label>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>
            <div className="add-new-job-row">
              <div className="add-new-job-field full-width">
                <label>Issue*</label>
                <textarea
                  name="issue"
                  value={formData.issue}
                  onChange={handleInputChange}
                  rows={4}
                  required
                />
              </div>
            </div>
          </div>
        </div>
        <div className="add-new-job-actions">
          <button
            type="button"
            className="add-new-job-cancel"
            onClick={() => navigate(`/leads/${id}`)}
          >
            Cancel
          </button>
          <button type="submit" className="add-new-job-submit" disabled={isLoading}>
            {isLoading ? "Converting…" : "Convert to Job"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ConvertLead;
