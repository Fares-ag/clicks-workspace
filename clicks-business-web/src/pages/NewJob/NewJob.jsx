import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateJobMutation } from "../../store/portalApi";
import VehicleMakeModelFields from "../../components/VehicleMakeModelFields.jsx";
import CustomSelect from "../../components/CustomSelect.jsx";
import DateTimePicker from "../../components/DateTimePicker.jsx";
import PhoneInput from "../../components/PhoneInput.jsx";
import {
  DEFAULT_COUNTRY_CODE,
  isValidLocalPhone,
  toLocalDigits,
} from "../../utils/phone";
import { JOB_TYPE_OPTIONS } from "../../constants/jobTypes";
import "../../styles/add-new-job.css";

const JOB_TYPES = JOB_TYPE_OPTIONS;

function NewJob() {
  const navigate = useNavigate();
  const [createJob, { isLoading }] = useCreateJobMutation();
  const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);
  const dateTimeInputRef = useRef(null);

  const [form, setForm] = useState({
    clientName: "",
    countryCode: DEFAULT_COUNTRY_CODE,
    clientMobileNumber: "",
    clientEmail: "",
    vehicleMake: "",
    vehicleModel: "",
    otherModel: "",
    vehicleYear: "",
    licensePlate: "",
    vinNumber: "",
    issue: "",
    location: "",
    jobType: "",
    price: "",
    dateTime: new Date().toISOString(),
  });
  const [phoneError, setPhoneError] = useState("");
  const [formError, setFormError] = useState("");
  const [locating, setLocating] = useState(false);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormError("");
  };

  const onPhoneChange = (value) => {
    const local = toLocalDigits(value, form.countryCode);
    setField("clientMobileNumber", local);
    if (local && !isValidLocalPhone(local)) {
      setPhoneError("Enter the 8-digit local number (without +974)");
    } else {
      setPhoneError("");
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setFormError("Geolocation is not supported in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setField("location", `${lat}, ${lng}`);
        setLocating(false);
      },
      (err) => {
        setFormError(err.message || "Could not get location");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    const local = toLocalDigits(form.clientMobileNumber, form.countryCode);
    if (!form.clientName.trim()) {
      setFormError("Customer name is required");
      return;
    }
    if (!isValidLocalPhone(local)) {
      setPhoneError("Phone number must be exactly 8 digits (without country code)");
      setFormError("Phone number must be exactly 8 digits (without country code)");
      return;
    }
    if (!form.issue.trim()) {
      setFormError("Issue description is mandatory");
      return;
    }
    if (!form.location.trim()) {
      setFormError("Location is required");
      return;
    }
    if (!form.jobType) {
      setFormError("Job type is required");
      return;
    }
    const priceNum = Number(form.price);
    if (form.price === "" || !Number.isFinite(priceNum) || priceNum <= 0) {
      setFormError("Price must be greater than 0");
      return;
    }
    if (!form.dateTime) {
      setFormError("Date and time are required");
      return;
    }

    const make = form.vehicleMake.trim();
    const model =
      form.vehicleModel === "Other"
        ? form.otherModel.trim()
        : form.vehicleModel.trim();
    if (!make || !model) {
      setFormError("Vehicle make and model are required");
      return;
    }

    const year = form.vehicleYear ? Number(form.vehicleYear) : undefined;
    const payload = {
      clientName: form.clientName.trim(),
      clientMobileNumber: local,
      countryCode: form.countryCode,
      ...(form.clientEmail.trim()
        ? { clientEmail: form.clientEmail.trim() }
        : {}),
      vehicleMake: make,
      vehicleModel: model,
      ...(year ? { vehicleYear: year } : {}),
      ...(form.licensePlate.trim()
        ? { licensePlate: form.licensePlate.trim() }
        : {}),
      ...(form.vinNumber.trim() ? { vinNumber: form.vinNumber.trim() } : {}),
      issue: form.issue.trim(),
      location: form.location.trim(),
      jobType: form.jobType,
      price: priceNum,
      dateTime: new Date(form.dateTime).toISOString(),
    };

    try {
      await createJob(payload).unwrap();
      navigate("/jobs", {
        replace: true,
        state: {
          successMessage:
            "Request submitted — Clicks will review and assign a technician.",
        },
      });
    } catch (err) {
      setFormError(
        err?.data?.message || err?.error || "Failed to submit request"
      );
    }
  };

  const dateTimeDisplay = form.dateTime
    ? new Date(form.dateTime).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "";

  return (
    <div className="add-new-job-container">
      <div className="add-new-job-header">
        <button
          type="button"
          className="add-new-job-back"
          onClick={() => navigate("/jobs")}
        >
          <img src="/icons/long-arrow-left.svg" alt="Back" />
        </button>
        <h1 className="add-new-job-title">New Request</h1>
      </div>

      <form onSubmit={handleSubmit} className="add-new-job-form">
        <div className="add-new-job-card">
          <div className="add-new-job-section">
            <h2 className="add-new-job-section-title">Client Details</h2>
            <div className="add-new-job-row">
              <div className="add-new-job-field">
                <label>Client Name*</label>
                <input
                  type="text"
                  value={form.clientName}
                  onChange={(e) => setField("clientName", e.target.value)}
                  placeholder="Enter client name"
                  required
                />
              </div>
              <div className="add-new-job-field">
                <label>Client Phone Number*</label>
                <PhoneInput
                  value={form.clientMobileNumber}
                  onChange={onPhoneChange}
                  countryCode={form.countryCode}
                  onCountryCodeChange={(code) =>
                    setForm((prev) => ({
                      ...prev,
                      countryCode: code,
                      clientMobileNumber: toLocalDigits(
                        prev.clientMobileNumber,
                        code
                      ),
                    }))
                  }
                  required
                  error={!!phoneError}
                />
                {phoneError && (
                  <span className="field-error-text">{phoneError}</span>
                )}
              </div>
              <div className="add-new-job-field">
                <label>Client Email Address</label>
                <input
                  type="email"
                  value={form.clientEmail}
                  onChange={(e) => setField("clientEmail", e.target.value)}
                  placeholder="client@example.com"
                />
              </div>
            </div>

            <div className="add-new-job-row">
              <VehicleMakeModelFields
                make={form.vehicleMake}
                model={form.vehicleModel}
                otherModel={form.otherModel}
                onMakeChange={(value) => {
                  setForm((prev) => ({
                    ...prev,
                    vehicleMake: value,
                    vehicleModel: "",
                    otherModel: "",
                  }));
                  setFormError("");
                }}
                onModelChange={(value) => setField("vehicleModel", value)}
                onOtherModelChange={(value) => setField("otherModel", value)}
              />
              {form.vehicleModel !== "Other" ? (
                <div className="add-new-job-field">
                  <label>Vehicle Year</label>
                  <input
                    type="number"
                    value={form.vehicleYear}
                    onChange={(e) => setField("vehicleYear", e.target.value)}
                    placeholder="e.g. 2024"
                    min="1900"
                    max="2030"
                  />
                </div>
              ) : null}
            </div>

            {form.vehicleModel !== "Other" ? (
              <div className="add-new-job-row">
                <div className="add-new-job-field">
                  <label>License Plate</label>
                  <input
                    type="text"
                    value={form.licensePlate}
                    onChange={(e) => setField("licensePlate", e.target.value)}
                    placeholder="Enter license plate"
                  />
                </div>
                <div className="add-new-job-field">
                  <label>VIN Number</label>
                  <input
                    type="text"
                    value={form.vinNumber}
                    onChange={(e) => setField("vinNumber", e.target.value)}
                    placeholder="Enter VIN number"
                  />
                </div>
                <div className="add-new-job-field" />
              </div>
            ) : null}
          </div>

          <div className="add-new-job-section">
            <h2 className="add-new-job-section-title">Job Details</h2>
            <div className="add-new-job-row">
              <div className="add-new-job-field">
                <label>Job Type*</label>
                <CustomSelect
                  value={form.jobType}
                  onChange={(value) => setField("jobType", value)}
                  options={JOB_TYPES}
                  placeholder="Select job type"
                />
              </div>
              <div className="add-new-job-field">
                <label>Price (QAR)*</label>
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => setField("price", e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="add-new-job-field" style={{ position: "relative" }}>
                <label>Date & Time*</label>
                <input
                  ref={dateTimeInputRef}
                  type="text"
                  value={dateTimeDisplay}
                  placeholder="Select date and time"
                  onClick={() => setDateTimePickerOpen(!dateTimePickerOpen)}
                  readOnly
                  required
                />
                {dateTimePickerOpen && (
                  <DateTimePicker
                    value={form.dateTime}
                    showTimePicker
                    onChange={(date) => {
                      setField("dateTime", date.toISOString());
                      setDateTimePickerOpen(false);
                    }}
                    onClose={() => setDateTimePickerOpen(false)}
                  />
                )}
              </div>
            </div>

            <div className="add-new-job-row">
              <div className="add-new-job-field full-width">
                <label>Issue Description*</label>
                <textarea
                  value={form.issue}
                  onChange={(e) => setField("issue", e.target.value)}
                  placeholder="Describe the issue"
                  rows={3}
                  required
                />
              </div>
            </div>

            <div className="add-new-job-row">
              <div className="add-new-job-field full-width">
                <label>Location*</label>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setField("location", e.target.value)}
                    placeholder="Address, lat/lng, or Google Maps / Waze link"
                    required
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="add-new-job-cancel"
                    onClick={useCurrentLocation}
                    disabled={locating}
                  >
                    {locating ? "Locating…" : "Use current location"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {formError && (
          <div className="field-error-text" style={{ marginTop: 16 }}>
            {formError}
          </div>
        )}

        <div className="add-new-job-actions">
          <button
            type="button"
            className="add-new-job-cancel"
            onClick={() => navigate("/jobs")}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="add-new-job-submit"
            disabled={isLoading}
          >
            {isLoading ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default NewJob;
