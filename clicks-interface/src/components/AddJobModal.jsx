import React, { useState, useEffect, useMemo } from "react";
import { useCreateJobMutation } from "../store/jobApi";
import { useGetTechniciansQuery } from "../store/technicianApi";
import { useGetSourcesQuery } from "../store/sourceApi";
import CustomSelect from "./CustomSelect.jsx";
import PhoneInput from "./PhoneInput.jsx";
import {
  DEFAULT_COUNTRY_CODE,
  isValidLocalPhone,
  toE164,
  toLocalDigits,
} from "../utils/phone";
import { JOB_TYPE_OPTIONS } from "../constants/jobTypes";
import "./AddJobModal.css";

function AddJobModal({ open, onClose, onSuccess, sosData }) {
  const [formData, setFormData] = useState({
    customer_id: "",
    customer_vehicle_id: "",
    clientName: "",
    clientMobileNumber: "",
    countryCode: DEFAULT_COUNTRY_CODE,
    issue: "",
    location: "",
    dateTime: "",
    jobType: "",
    assignedTechnician: "",
    price: "",
    source: "",
    sos_id: ""
  });

  const [createJob, { isLoading }] = useCreateJobMutation();
  const { data: techniciansData } = useGetTechniciansQuery({ limit: 100 }, { skip: !open });
  const { data: sourcesData } = useGetSourcesQuery(undefined, { skip: !open });
  
  const allTechnicians = techniciansData?.technicians || [];
  const sources = sourcesData?.sources || [];

  // Filter technicians by online/on_job status and expertise matching job type
  const availableTechnicians = useMemo(() => {
    const filtered = allTechnicians.filter(tech => {
      const isApproved = tech.applicationStatus === 'Approved';
      const isAvailable = tech.currentStatus === 'Online' || tech.currentStatus === 'On Job';
      
      // If no job type selected, only filter by status
      if (!formData.jobType) {
        return isApproved && isAvailable;
      }
      
      // If job type is selected, also check expertise
      const techExpertise = tech.expertise || [];
      const matchesExpertise = techExpertise.includes(formData.jobType);
      
      return isApproved && isAvailable && matchesExpertise;
    });
    
    return filtered;
  }, [allTechnicians, formData.jobType]);

  // Populate form with SOS data if available
  useEffect(() => {
    if (sosData && open) {
      // Find the SOS source from sources list
      const sosSource = sources.find(s => s.mainSourceName?.toLowerCase() === 'sos');
      
      setFormData(prev => ({
        ...prev,
        customer_id: sosData.customer_id,
        customer_vehicle_id: sosData.customer_vehicle_id,
        clientName: sosData.customer.name,
        clientMobileNumber: toLocalDigits(
          sosData.customer.phone,
          DEFAULT_COUNTRY_CODE
        ),
        issue: "", // Optional - admin fills this
        location: sosData.location.coordinates, // GPS coordinates as string
        source: sosSource?._id || "",
        sos_id: sosData.sos_id
      }));
    }
  }, [sosData, open, sources]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValidLocalPhone(formData.clientMobileNumber)) {
      alert("Phone number must be exactly 8 digits (without country code)");
      return;
    }
    try {
      const jobData = {
        customer_id: formData.customer_id,
        customer_vehicle_id: formData.customer_vehicle_id,
        clientName: formData.clientName,
        clientMobileNumber: toE164(
          formData.clientMobileNumber,
          formData.countryCode
        ),
        issue: formData.issue || "No issue description provided",
        location: formData.location,
        dateTime: formData.dateTime,
        jobType: formData.jobType,
        assignedTechnician: formData.assignedTechnician,
        price: formData.price,
        source: formData.source
        // Don't send job_status - let backend decide based on technician assignment
      };
      
      // Only include sos_request_id if it exists
      if (formData.sos_id) {
        jobData.sos_request_id = formData.sos_id;
      }
      
      await createJob(jobData).unwrap();
      handleCancel();
      onSuccess?.();
    } catch (error) {
      console.error("Error creating job:", error);
      alert(error?.data?.message || "Failed to create job. Please try again.");
    }
  };

  const handleCancel = () => {
    setFormData({
      customer_id: "",
      customer_vehicle_id: "",
      clientName: "",
      clientMobileNumber: "",
      countryCode: DEFAULT_COUNTRY_CODE,
      issue: "",
      location: "",
      dateTime: "",
      jobType: "",
      assignedTechnician: "",
      price: "",
      source: "",
      sos_id: ""
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="add-job-modal-backdrop">
      <div className="add-job-modal">
        <button className="add-job-modal-close" onClick={handleCancel} aria-label="Close">
          <span className="add-job-modal-close-x">&#10005;</span>
        </button>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="add-job-modal-header">
            <div className="add-job-modal-title">Add New Job</div>
            <div className="add-job-modal-subtitle">Add your job details</div>
          </div>
          <div className="add-job-modal-section">
            <div className="add-job-modal-section-title">Client Details</div>
            <div className="add-job-modal-fields">
              <div className="add-job-modal-row">
                <div className="add-job-modal-field">
                  <label>Client Name*</label>
                  <input
                    type="text"
                    name="clientName"
                    value={formData.clientName}
                    onChange={handleInputChange}
                    disabled={!!sosData}
                    required
                  />
                </div>
                <div className="add-job-modal-field">
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
                    disabled={!!sosData}
                    required
                  />
                </div>
              </div>
              {sosData && (
                <div className="add-job-modal-row">
                  <div className="add-job-modal-field" style={{ width: 612 }}>
                    <label>Vehicle</label>
                    <input
                      type="text"
                      value={`${sosData.vehicle.make} ${sosData.vehicle.model} - ${sosData.vehicle.plate}`}
                      disabled
                      style={{ background: '#F9FAFB', color: '#667085' }}
                    />
                  </div>
                </div>
              )}
              <div className="add-job-modal-row">
                <div className="add-job-modal-field" style={{ width: 612 }}>
                  <label>Issue{!sosData && '*'}</label>
                  <textarea
                    name="issue"
                    value={formData.issue}
                    onChange={handleInputChange}
                    className="add-job-modal-textarea"
                    placeholder="Describe the issue..."
                    required={!sosData}
                  />
                </div>
              </div>
              <div className="add-job-modal-row">
                <div className="add-job-modal-field">
                  <label>Location* {!sosData && <span style={{color: '#667085', fontWeight: 400, fontSize: '12px'}}>(Address only - no GPS)</span>}</label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    placeholder={sosData ? "GPS coordinates from SOS" : "Enter full address (e.g., Al Rayyan, Doha)"}
                    required
                  />
                </div>
                <div className="add-job-modal-field">
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
              <div className="add-job-modal-row">
                <div className="add-job-modal-field">
                  <label>Job Type*</label>
                  <CustomSelect
                    value={formData.jobType}
                    onChange={(value) => setFormData(prev => ({ ...prev, jobType: value }))}
                    options={JOB_TYPE_OPTIONS.map(({ value, label }) => ({
                      value,
                      label,
                    }))}
                    placeholder="Select Job Type"
                  />
                </div>
                <div className="add-job-modal-field">
                  <label>Assigned Technician</label>
                  <CustomSelect
                    value={formData.assignedTechnician}
                    onChange={(value) => setFormData(prev => ({ ...prev, assignedTechnician: value }))}
                    options={availableTechnicians.map(tech => ({
                      value: tech._id,
                      label: `${tech.firstName} ${tech.lastName}`
                    }))}
                    placeholder="Select Technician"
                  />
                </div>
              </div>
              <div className="add-job-modal-row">
                <div className="add-job-modal-field">
                  <label>Source*</label>
                  <CustomSelect
                    value={formData.source}
                    onChange={(value) => setFormData(prev => ({ ...prev, source: value }))}
                    options={sources.filter(source => source.mainSourceName).map(source => ({
                      value: source._id,
                      label: source.mainSourceName
                    }))}
                    placeholder="Select Source"
                  />
                </div>
                <div className="add-job-modal-field">
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
            <button className="add-job-modal-submit" type="submit">
              Add Job
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddJobModal;
