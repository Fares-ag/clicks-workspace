import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCreateLeadMutation } from "../../store/leadApi";
import { useGetSourcesQuery } from "../../store/sourceApi";
import { useGetVehicleMakesQuery, useGetVehicleModelsByMakeQuery } from "../../store/vehicleConfigApi";
import CustomSelect from "../../components/CustomSelect.jsx";
import PhoneInput from "../../components/PhoneInput.jsx";
import {
  DEFAULT_COUNTRY_CODE,
  isValidLocalPhone,
  localLengthHint,
  toE164,
  toLocalDigits,
} from "../../utils/phone";
import "../JobManagement/AddNewJob.css";

function AddNewLead() {
  const navigate = useNavigate();
  const location = useLocation();
  const serviceRequestData = location.state?.serviceRequestData;

  const [formData, setFormData] = useState({
    clientName: "",
    countryCode: DEFAULT_COUNTRY_CODE,
    clientMobileNumber: "",
    clientEmail: "",
    inquiry: "",
    internalNotes: "",
    serviceType: "",
    timing: "",
    preferredDateTime: "",
    location: "",
    vehicleMake: "",
    vehicleModel: "",
    vehicleYear: "",
    licensePlate: "",
    vinNumber: "",
    source: "",
    subSource: "",
    customer_id: "",
    customer_vehicle_id: "",
    service_request_id: "",
  });
  const [phoneError, setPhoneError] = useState("");
  const [createLead, { isLoading }] = useCreateLeadMutation();
  const { data: sourcesData } = useGetSourcesQuery();
  const { data: vehicleMakesData } = useGetVehicleMakesQuery();

  const sources = sourcesData?.sources || [];
  const selectedSource = sources.find((s) => s._id === formData.source);
  const subSources = selectedSource?.subSources || [];
  const selectedMakeObj = vehicleMakesData?.makes?.find(
    (m) => m.makeName === formData.vehicleMake || m._id === formData.vehicleMake
  );
  const { data: vehicleModelsData } = useGetVehicleModelsByMakeQuery(
    selectedMakeObj?._id,
    { skip: !selectedMakeObj?._id }
  );
  const vehicleMakes = vehicleMakesData?.makes || [];
  const vehicleModels = vehicleModelsData?.models || [];

  useEffect(() => {
    if (!serviceRequestData) return;
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
      inquiry: serviceRequestData.service_type || "",
      serviceType: serviceRequestData.service_type || "",
      timing: serviceRequestData.timing || "",
      preferredDateTime:
        scheduled && !Number.isNaN(scheduled.getTime())
          ? scheduled.toISOString().slice(0, 16)
          : "",
      location: serviceRequestData.location?.coordinates || "",
      vehicleMake: vehicle.make && vehicle.make !== "Unknown" ? vehicle.make : "",
      vehicleModel:
        vehicle.model && vehicle.model !== "Unknown" ? vehicle.model : "",
      vehicleYear:
        vehicle.year && vehicle.year !== "Unknown" ? String(vehicle.year) : "",
      licensePlate:
        vehicle.plate && vehicle.plate !== "Unknown" ? vehicle.plate : "",
      source: appSource?._id || prev.source,
      service_request_id:
        serviceRequestData.service_request_id ||
        serviceRequestData._id ||
        "",
    }));
  }, [serviceRequestData, sources]);

  const handlePhoneChange = (localDigits) => {
    setFormData((prev) => ({ ...prev, clientMobileNumber: localDigits }));
    const cc = formData.countryCode || DEFAULT_COUNTRY_CODE;
    if (localDigits.length > 0 && !isValidLocalPhone(localDigits, cc)) {
      setPhoneError(`Enter the ${localLengthHint(cc)} local number (without ${cc})`);
    } else {
      setPhoneError("");
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.inquiry?.trim()) {
      alert("Inquiry description is required");
      return;
    }
    if (!isValidLocalPhone(formData.clientMobileNumber, formData.countryCode)) {
      alert("Enter a valid local phone number (without the country code)");
      return;
    }
    if (!formData.source) {
      alert("Source is required");
      return;
    }

    try {
      await createLead({
        clientName: formData.clientName,
        clientMobileNumber: toE164(
          formData.clientMobileNumber,
          formData.countryCode
        ),
        clientEmail: formData.clientEmail,
        inquiry: formData.inquiry.trim(),
        internalNotes: formData.internalNotes,
        serviceType: formData.serviceType,
        timing: formData.timing || undefined,
        preferredDateTime: formData.preferredDateTime || null,
        location: formData.location,
        vehicleMake: formData.vehicleMake,
        vehicleModel: formData.vehicleModel,
        vehicleYear: formData.vehicleYear
          ? Number(formData.vehicleYear)
          : undefined,
        licensePlate: formData.licensePlate,
        vinNumber: formData.vinNumber,
        source: formData.source,
        subSource: formData.subSource,
        customer_id: formData.customer_id || undefined,
        customer_vehicle_id: formData.customer_vehicle_id || undefined,
        service_request_id: formData.service_request_id || undefined,
      }).unwrap();
      navigate("/leads", { state: { successMessage: "Lead created successfully" } });
    } catch (error) {
      alert(error?.data?.message || "Failed to create lead");
    }
  };

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
        <h1 className="add-new-job-title">Add New Lead</h1>
      </div>

      <form onSubmit={handleSubmit} className="add-new-job-form">
        <div className="add-new-job-card">
          <div className="add-new-job-section">
            <h2 className="add-new-job-section-title">Contact</h2>
            <div className="add-new-job-row">
              <div className="add-new-job-field">
                <label>Client Name*</label>
                <input
                  type="text"
                  name="clientName"
                  value={formData.clientName}
                  onChange={handleInputChange}
                  required
                  disabled={!!serviceRequestData}
                />
              </div>
              <div className="add-new-job-field">
                <label>Client Phone Number*</label>
                <PhoneInput
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
                  disabled={!!serviceRequestData}
                  required
                  error={!!phoneError}
                />
              </div>
              <div className="add-new-job-field">
                <label>Client Email</label>
                <input
                  type="email"
                  name="clientEmail"
                  value={formData.clientEmail}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>

          <div className="add-new-job-section">
            <h2 className="add-new-job-section-title">Inquiry</h2>
            <div className="add-new-job-row">
              <div className="add-new-job-field" style={{ flex: "1 1 100%" }}>
                <label>What did they inquire about?*</label>
                <textarea
                  name="inquiry"
                  value={formData.inquiry}
                  onChange={handleInputChange}
                  required
                  rows={3}
                  placeholder="Describe the service need, symptoms, or questions"
                />
              </div>
            </div>
            <div className="add-new-job-row">
              <div className="add-new-job-field">
                <label>Source*</label>
                <CustomSelect
                  value={formData.source}
                  onChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      source: value,
                      subSource: "",
                    }))
                  }
                  options={sources
                    .filter((s) => s.mainSourceName)
                    .map((s) => ({ value: s._id, label: s.mainSourceName }))}
                  placeholder="Select Source"
                  searchable
                />
              </div>
              <div className="add-new-job-field">
                <label>Sub Source</label>
                <CustomSelect
                  value={formData.subSource}
                  onChange={(value) =>
                    setFormData((prev) => ({ ...prev, subSource: value }))
                  }
                  options={subSources.map((s) => ({
                    value: s.name,
                    label: s.name,
                  }))}
                  placeholder="Select Sub Source"
                  disabled={!formData.source}
                />
              </div>
              <div className="add-new-job-field">
                <label>Location (optional)</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  placeholder="Address, lat/lng, or Google Maps / Waze link"
                />
              </div>
            </div>
            <div className="add-new-job-row">
              <div className="add-new-job-field">
                <label>Internal notes</label>
                <textarea
                  name="internalNotes"
                  value={formData.internalNotes}
                  onChange={handleInputChange}
                  rows={2}
                />
              </div>
            </div>
          </div>

          <div className="add-new-job-section">
            <h2 className="add-new-job-section-title">Vehicle (optional)</h2>
            <div className="add-new-job-row">
              <div className="add-new-job-field">
                <label>Make</label>
                <CustomSelect
                  value={formData.vehicleMake}
                  onChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      vehicleMake: value,
                      vehicleModel: "",
                    }))
                  }
                  options={vehicleMakes.map((m) => ({
                    value: m.makeName,
                    label: m.makeName,
                  }))}
                  placeholder="Select Make"
                  searchable
                />
              </div>
              <div className="add-new-job-field">
                <label>Model</label>
                <CustomSelect
                  value={formData.vehicleModel}
                  onChange={(value) =>
                    setFormData((prev) => ({ ...prev, vehicleModel: value }))
                  }
                  options={vehicleModels.map((m) => ({
                    value: m.modelName,
                    label: m.modelName,
                  }))}
                  placeholder="Select Model"
                  searchable
                  disabled={!formData.vehicleMake}
                />
              </div>
              <div className="add-new-job-field">
                <label>Year</label>
                <input
                  type="number"
                  name="vehicleYear"
                  value={formData.vehicleYear}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="add-new-job-actions">
          <button type="button" className="add-new-job-cancel" onClick={() => navigate("/leads")}>
            Cancel
          </button>
          <button type="submit" className="add-new-job-submit" disabled={isLoading}>
            {isLoading ? "Saving…" : "Create Lead"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AddNewLead;
