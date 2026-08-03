import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCreateJobMutation } from "../../store/jobApi";
import { useGetTechniciansQuery } from "../../store/technicianApi";
import { useGetSourcesQuery } from "../../store/sourceApi";
import { useGetVehicleMakesQuery, useGetVehicleModelsByMakeQuery } from "../../store/vehicleConfigApi";
import CustomSelect from "../../components/CustomSelect.jsx";
import DateTimePicker from "../../components/DateTimePicker.jsx";
import PhoneInput from "../../components/PhoneInput.jsx";
import {
  DEFAULT_COUNTRY_CODE,
  isValidLocalPhone,
  toE164,
  toLocalDigits,
} from "../../utils/phone";
import "./AddNewJob.css";
import { JOB_TYPE_MAPPING, JOB_TYPE_OPTIONS, jobTypeLabel } from "../../constants/jobTypes";

function AddNewJob() {
  const navigate = useNavigate();
  const location = useLocation();
  const sosData = location.state?.sosData;
  const serviceRequestData = location.state?.serviceRequestData;

  const [formData, setFormData] = useState({
    customer_id: "",
    customer_vehicle_id: "",
    clientName: "",
    countryCode: DEFAULT_COUNTRY_CODE,
    clientMobileNumber: "",
    clientEmail: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleYear: "",
    licensePlate: "",
    vinNumber: "",
    issue: "",
    location: "",
    dateTime: "",
    jobType: "",
    assignedTechnician: "",
    price: "",
    source: "",
    subSource: "",
    sos_id: "",
    service_request_id: "",
  });

  const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);
  const dateTimeInputRef = useRef(null);
  const [phoneError, setPhoneError] = useState("");

  const [createJob, { isLoading }] = useCreateJobMutation();
  const { data: techniciansData, refetch: refetchTechnicians } = useGetTechniciansQuery({ limit: 100 });
  const { data: sourcesData } = useGetSourcesQuery();
  const { data: vehicleMakesData } = useGetVehicleMakesQuery();
  
  // Get models for selected make
  const selectedMakeObj = vehicleMakesData?.makes?.find(m => m.makeName === formData.vehicleMake || m._id === formData.vehicleMake);
  const { data: vehicleModelsData } = useGetVehicleModelsByMakeQuery(selectedMakeObj?._id, { skip: !selectedMakeObj?._id });
  
  const allTechnicians = techniciansData?.technicians || [];
  const sources = sourcesData?.sources || [];
  const jobTypeMapping = JOB_TYPE_MAPPING;
  const vehicleMakes = vehicleMakesData?.makes || [];
  const vehicleModels = vehicleModelsData?.models || [];

  // Get sub-sources for selected source
  const selectedSource = sources.find(s => s._id === formData.source);
  const subSources = selectedSource?.subSources || [];

  // Build vehicle make options with search
  const vehicleMakeOptions = vehicleMakes.map(make => ({
    value: make.makeName,
    label: make.makeName
  }));

  // Build vehicle model options with "Other" option
  const vehicleModelOptions = [
    ...vehicleModels.map(model => ({
      value: model.modelName,
      label: model.modelName
    })),
    { value: "Other", label: "Other" }
  ];

  // Filter technicians by online/on_job status and expertise matching job type
  const availableTechnicians = useMemo(() => {
    const filtered = allTechnicians.filter(tech => {
      const isApproved = tech.applicationStatus === 'Approved';
      const isAvailable = tech.currentStatus === 'Online' || tech.currentStatus === 'On Job';
      
      if (!formData.jobType) {
        return isApproved && isAvailable;
      }
      
      const requiredExpertise = jobTypeMapping[formData.jobType];
      const techExpertise = tech.expertise || [];
      const matchesExpertise = techExpertise.includes(requiredExpertise);
      
      return isApproved && isAvailable && matchesExpertise;
    });
    
    return filtered;
  }, [allTechnicians, formData.jobType, jobTypeMapping]);

  // Populate form with SOS data if available
  useEffect(() => {
    if (sosData) {
      const sosSource = sources.find(s => s.mainSourceName?.toLowerCase() === 'sos');
      
      setFormData(prev => ({
        ...prev,
        customer_id: sosData.customer_id,
        customer_vehicle_id: sosData.customer_vehicle_id || "",
        clientName: sosData.customer?.name || "",
        clientMobileNumber: toLocalDigits(
          sosData.customer?.phone || "",
          prev.countryCode || DEFAULT_COUNTRY_CODE
        ),
        issue: sosData.skip_vehicle ? "SOS — vehicle not provided by customer" : "",
        location: sosData.location?.coordinates || "",
        source: sosSource?._id || "",
        sos_id: sosData.sos_id
      }));
    }
  }, [sosData, sources]);

  // Populate form from Service Request (no claim step)
  useEffect(() => {
    if (serviceRequestData) {
      const appSource =
        sources.find((s) => s.mainSourceName?.toLowerCase() === "app") ||
        sources.find((s) => s.mainSourceName?.toLowerCase() === "mobile") ||
        sources[0];
      const vehicle = serviceRequestData.vehicle || {};
      const scheduled =
        serviceRequestData.timing === "scheduled" &&
        serviceRequestData.scheduled_for
          ? new Date(serviceRequestData.scheduled_for)
          : null;

      setFormData((prev) => ({
        ...prev,
        customer_id: serviceRequestData.customer_id || "",
        customer_vehicle_id: serviceRequestData.customer_vehicle_id || "",
        clientName: serviceRequestData.customer?.name || "",
        clientMobileNumber: toLocalDigits(
          serviceRequestData.customer?.phone || "",
          prev.countryCode || DEFAULT_COUNTRY_CODE
        ),
        vehicleMake: vehicle.make && vehicle.make !== "Unknown" ? vehicle.make : "",
        vehicleModel:
          vehicle.model && vehicle.model !== "Unknown" ? vehicle.model : "",
        vehicleYear:
          vehicle.year && vehicle.year !== "Unknown" ? String(vehicle.year) : "",
        licensePlate:
          vehicle.plate && vehicle.plate !== "Unknown" ? vehicle.plate : "",
        issue: serviceRequestData.service_type || "",
        location: serviceRequestData.location?.coordinates || "",
        dateTime: scheduled && !Number.isNaN(scheduled.getTime())
          ? scheduled.toISOString()
          : prev.dateTime,
        source: appSource?._id || prev.source,
        service_request_id:
          serviceRequestData.service_request_id ||
          serviceRequestData._id ||
          "",
      }));
    }
  }, [serviceRequestData, sources]);

  const handlePhoneChange = (localDigits) => {
    setFormData((prev) => ({ ...prev, clientMobileNumber: localDigits }));
    if (localDigits.length > 0 && !isValidLocalPhone(localDigits)) {
      setPhoneError("Enter the 8-digit local number (without +974)");
    } else {
      setPhoneError("");
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate issue is provided
    if (!formData.issue || !formData.issue.trim()) {
      alert("Issue description is mandatory");
      return;
    }
    
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
        clientEmail: formData.clientEmail,
        vehicleMake: formData.vehicleMake,
        vehicleModel: formData.vehicleModel,
        vehicleYear: formData.vehicleYear ? Number(formData.vehicleYear) : undefined,
        licensePlate: formData.licensePlate,
        vinNumber: formData.vinNumber,
        issue: formData.issue.trim(),
        location: formData.location,
        dateTime: formData.dateTime,
        jobType: formData.jobType,
        assignedTechnician: formData.assignedTechnician,
        price: formData.price,
        source: formData.source,
        subSource: formData.subSource
      };
      
      if (formData.sos_id) {
        jobData.sos_request_id = formData.sos_id;
      }
      if (formData.service_request_id) {
        jobData.service_request_id = formData.service_request_id;
      }
      
      await createJob(jobData).unwrap();
      navigate("/jobs", { state: { successMessage: "Job created successfully" } });
    } catch (error) {
      console.error("Error creating job:", error);
      alert(error?.data?.message || "Failed to create job. Please try again.");
    }
  };

  const handleCancel = () => {
    navigate("/jobs");
  };

  return (
    <div className="add-new-job-container">
      <div className="add-new-job-header">
        <button className="add-new-job-back" onClick={handleCancel}>
          <img src="/icons/long-arrow-left.svg" alt="Back" />
        </button>
        <h1 className="add-new-job-title">Add New Job</h1>
      </div>

      <form onSubmit={handleSubmit} className="add-new-job-form">
        <div className="add-new-job-card">
          {/* Section 1: Client Details */}
          <div className="add-new-job-section">
            <h2 className="add-new-job-section-title">Client Details</h2>
            
            <div className="add-new-job-row">
              <div className="add-new-job-field">
                <label>Client Name*</label>
                <input
                  type="text"
                  name="clientName"
                  value={formData.clientName}
                  onChange={handleInputChange}
                  disabled={!!sosData}
                  required
                  placeholder="Enter client name"
                />
              </div>

              <div className="add-new-job-field">
                <label>Client Phone Number*</label>
                <PhoneInput
                  name="clientMobileNumber"
                  value={formData.clientMobileNumber}
                  onChange={handlePhoneChange}
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
                  error={!!phoneError}
                />
                {phoneError && <span className="field-error-text">{phoneError}</span>}
              </div>

              <div className="add-new-job-field">
                <label>Client Email Address</label>
                <input
                  type="email"
                  name="clientEmail"
                  value={formData.clientEmail}
                  onChange={handleInputChange}
                  placeholder="client@example.com"
                  disabled={!!sosData}
                />
              </div>
            </div>

            <div className="add-new-job-row">
              <div className="add-new-job-field">
                <label>Source*</label>
                <CustomSelect
                  value={formData.source}
                  onChange={(value) => setFormData(prev => ({ ...prev, source: value, subSource: "" }))}
                  options={sources.filter(source => source.mainSourceName).map(source => ({
                    value: source._id,
                    label: source.mainSourceName
                  }))}
                  placeholder="Select Source"
                  searchable
                />
              </div>

              <div className="add-new-job-field">
                <label>Sub Source</label>
                <CustomSelect
                  value={formData.subSource}
                  onChange={(value) => setFormData(prev => ({ ...prev, subSource: value }))}
                  options={subSources.map(sub => ({
                    value: sub.name,
                    label: sub.name
                  }))}
                  placeholder={formData.source ? "Select Sub Source" : "Select Source First"}
                  disabled={!formData.source || subSources.length === 0}
                  searchable
                />
              </div>

              <div className="add-new-job-field"></div>
            </div>

            <div className="add-new-job-row">
              <div className="add-new-job-field">
                <label>Vehicle Make*</label>
                <CustomSelect
                  value={formData.vehicleMake}
                  onChange={(value) => setFormData(prev => ({ ...prev, vehicleMake: value, vehicleModel: "" }))}
                  options={vehicleMakeOptions}
                  placeholder="Select vehicle make"
                  searchable
                />
              </div>

              <div className="add-new-job-field">
                <label>Vehicle Model*</label>
                <CustomSelect
                  value={formData.vehicleModel}
                  onChange={(value) => setFormData(prev => ({ ...prev, vehicleModel: value }))}
                  options={vehicleModelOptions}
                  placeholder={formData.vehicleMake ? "Select vehicle model" : "Select Make First"}
                  disabled={!formData.vehicleMake}
                  searchable
                />
              </div>

              <div className="add-new-job-field">
                <label>Vehicle Year</label>
                <input
                  type="number"
                  name="vehicleYear"
                  value={formData.vehicleYear || ''}
                  onChange={handleInputChange}
                  placeholder="e.g. 2024"
                  min="1900"
                  max="2030"
                />
              </div>
            </div>

            <div className="add-new-job-row">
              <div className="add-new-job-field">
                <label>License Plate</label>
                <input
                  type="text"
                  name="licensePlate"
                  value={formData.licensePlate || ''}
                  onChange={handleInputChange}
                  placeholder="Enter license plate"
                />
              </div>

              <div className="add-new-job-field">
                <label>VIN Number</label>
                <input
                  type="text"
                  name="vinNumber"
                  value={formData.vinNumber || ''}
                  onChange={handleInputChange}
                  placeholder="Enter VIN number"
                />
              </div>

              <div className="add-new-job-field"></div>
            </div>
          </div>

          {/* Section 2: Job Details */}
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
                  placeholder="Enter full address (e.g., Al Rayyan, Doha)"
                  required
                />
              </div>

              <div className="add-new-job-field" style={{ position: 'relative' }}>
                <label>Date & Time*</label>
                <input
                  ref={dateTimeInputRef}
                  type="text"
                  name="dateTime"
                  value={formData.dateTime ? new Date(formData.dateTime).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  }) : ''}
                  placeholder="Select date and time"
                  onClick={() => setDateTimePickerOpen(!dateTimePickerOpen)}
                  readOnly
                  required
                />
                {dateTimePickerOpen && (
                  <DateTimePicker
                    value={formData.dateTime}
                    onChange={(date) => {
                      setFormData(prev => ({ 
                        ...prev, 
                        dateTime: date.toISOString()
                      }));
                      setDateTimePickerOpen(false);
                    }}
                    onClose={() => setDateTimePickerOpen(false)}
                    showTimePicker={true}
                  />
                )}
              </div>

              <div className="add-new-job-field"></div>
            </div>

            <div className="add-new-job-row">
              <div className="add-new-job-field">
                <label>Type of Job*</label>
                <CustomSelect
                  value={formData.jobType}
                  onChange={(value) => {
                    setFormData(prev => ({ 
                      ...prev, 
                      jobType: value,
                      assignedTechnician: "" // Reset technician when job type changes
                    }));
                  }}
                  options={JOB_TYPE_OPTIONS.map(({ value, label }) => ({
                    value,
                    label,
                  }))}
                  placeholder="Select Job Type"
                  searchable
                />
              </div>

              <div className="add-new-job-field">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <label style={{ margin: 0 }}>Assigned Technician</label>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      refetchTechnicians();
                    }}
                    style={{
                      background: 'none',
                      border: '1px solid #D0D5DD',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      color: '#344054'
                    }}
                    title="Refresh technician list"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <polyline points="1 20 1 14 7 14"></polyline>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                    </svg>
                    Refresh
                  </button>
                </div>
                <CustomSelect
                  value={formData.assignedTechnician}
                  onChange={(value) => setFormData(prev => ({ ...prev, assignedTechnician: value }))}
                  options={availableTechnicians.map(tech => ({
                    value: tech._id,
                    label: `${tech.firstName} ${tech.lastName}${tech.expertise?.length ? ` (${tech.expertise.join(', ')})` : ''}`
                  }))}
                  placeholder={formData.jobType ? "Select Technician" : "Select Job Type First"}
                  disabled={!formData.jobType}
                  searchable
                />
                {formData.jobType && availableTechnicians.length === 0 && (
                  <p style={{ marginTop: 8, fontSize: 12, color: '#B42318' }}>
                    No Online/On Job technicians with expertise “{jobTypeLabel(formData.jobType)}”.
                    Edit the technician and set expertise to match this job type, then click Refresh.
                  </p>
                )}
              </div>

              <div className="add-new-job-field">
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

            <div className="add-new-job-row">
              <div className="add-new-job-field full-width">
                <label>Issue*</label>
                <textarea
                  name="issue"
                  value={formData.issue}
                  onChange={handleInputChange}
                  placeholder="Describe the issue..."
                  rows={4}
                  required
                />
              </div>
            </div>
          </div>
        </div>

        <div className="add-new-job-actions">
          <button type="button" className="add-new-job-cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button type="submit" className="add-new-job-submit" disabled={isLoading}>
            {isLoading ? "Creating..." : "Add Job"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AddNewJob;
