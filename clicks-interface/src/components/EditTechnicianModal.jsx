import React, { useState, useEffect } from "react";
import "./AddTechnicianModal.css";
import DatePicker from "./DatePicker";
import MultiSelectDropdown from "./MultiSelectDropdown";
import PhoneInput from "./PhoneInput";
import { useUpdateTechnicianMutation } from "../store/technicianApi";
import {
  DEFAULT_COUNTRY_CODE,
  countryCodeFromPhone,
  isValidLocalPhone,
  localLengthHint,
  toE164,
  toLocalDigits,
} from "../utils/phone";
import { TECHNICIAN_EXPERTISE_OPTIONS } from "../constants/jobTypes";

export default function EditTechnicianModal({
  open,
  onClose,
  technician,
  onSuccess
}) {
  const [fields, setFields] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [workPermitDatePickerOpen, setWorkPermitDatePickerOpen] = useState(false);
  const [licenseExpiryDatePickerOpen, setLicenseExpiryDatePickerOpen] = useState(false);
  const [updateTechnician, { isLoading, error }] = useUpdateTechnicianMutation();

  useEffect(() => {
    if (technician) {
      setFields({
        firstName: technician.firstName || "",
        lastName: technician.lastName || "",
        email: technician.email || "",
        phone: toLocalDigits(
          technician.phone || "",
          countryCodeFromPhone(technician.phone)
        ),
        countryCode: countryCodeFromPhone(technician.phone),
        expertise: technician.expertise || [],
        profileImage: null,
        password: "",
        confirmPassword: "",
        workPermitFront: null,
        workPermitBack: null,
        workPermitExpiry: technician.workPermitExpiration
          ? String(technician.workPermitExpiration).slice(0, 10)
          : "",
        licenseFront: null,
        licenseBack: null,
        licenseExpiry: technician.drivingLicenseExpiration
          ? String(technician.drivingLicenseExpiration).slice(0, 10)
          : ""
      });
      setErrors({});
      setTouched({});
    }
  }, [technician, open]);

  if (!open) return null;
  if (!technician) {
    return (
      <div className="add-tech-modal-backdrop">
        <div className="add-tech-modal">
          <div style={{ padding: 48, textAlign: "center" }}>
            <span>Loading technician data...</span>
          </div>
        </div>
      </div>
    );
  }

  const handleChange = (field, value) => {
    setFields(f => ({ ...f, [field]: value }));
    setTouched(t => ({ ...t, [field]: true }));
    setErrors(e => ({ ...e, [field]: "" }));
  };

  const handleFileChange = (field, e) => {
    const file = e.target.files[0];
    handleChange(field, file || null);
  };

  const validate = () => {
    const newErrors = {};
    if (!fields.firstName) newErrors.firstName = "First Name required.";
    if (!fields.lastName) newErrors.lastName = "Last Name required.";
    if (!fields.email) newErrors.email = "Email Address required.";
    if (!fields.phone) newErrors.phone = "Phone required.";
    else if (!isValidLocalPhone(fields.phone, fields.countryCode)) {
      const cc = fields.countryCode || DEFAULT_COUNTRY_CODE;
      newErrors.phone = `Enter the ${localLengthHint(cc)} local number (without ${cc}).`;
    }
    if (!fields.expertise || fields.expertise.length === 0) newErrors.expertise = "At least one expertise required.";
    if (fields.password) {
      if (
        fields.password.length < 8 ||
        !/\d/.test(fields.password) ||
        !/[!@#$%^&*(),.?":{}|<>]/.test(fields.password)
      ) {
        newErrors.password =
          "Password must be at least 8 characters, including numbers and special characters.";
      }
      if (!fields.confirmPassword)
        newErrors.confirmPassword = "Confirm Password required.";
      if (
        fields.password &&
        fields.confirmPassword &&
        fields.password !== fields.confirmPassword
      ) {
        newErrors.confirmPassword = "Passwords do not match.";
      }
    }
    setErrors(newErrors);
    return Object.values(newErrors).every(e => !e);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setTouched({
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      password: true,
      confirmPassword: true,
      workPermitFront: true,
      workPermitBack: true,
      workPermitExpiry: true,
      licenseFront: true,
      licenseBack: true,
      licenseExpiry: true
    });
    if (validate()) {
      const formData = new FormData();
      formData.append("firstName", fields.firstName);
      formData.append("lastName", fields.lastName);
      formData.append("email", fields.email);
      formData.append(
        "phone",
        toE164(fields.phone, fields.countryCode || DEFAULT_COUNTRY_CODE)
      );
      
      // Always send expertise, even if empty
      if (fields.expertise && fields.expertise.length > 0) {
        fields.expertise.forEach(exp => formData.append("expertise", exp));
      }
      
      if (fields.password) formData.append("password", fields.password);
      if (fields.profileImage) formData.append("profileImage", fields.profileImage);
      if (fields.workPermitFront) formData.append("workPermitFront", fields.workPermitFront);
      if (fields.workPermitBack) formData.append("workPermitBack", fields.workPermitBack);
      if (fields.workPermitExpiry) formData.append("workPermitExpiration", fields.workPermitExpiry);
      if (fields.licenseFront) formData.append("drivingLicenseFront", fields.licenseFront);
      if (fields.licenseBack) formData.append("drivingLicenseBack", fields.licenseBack);
      if (fields.licenseExpiry) formData.append("drivingLicenseExpiration", fields.licenseExpiry);

      // Debug: Log FormData contents
      console.log('EditTechnicianModal - FormData contents:');
      for (let pair of formData.entries()) {
        console.log(pair[0] + ': ' + pair[1]);
      }

      try {
        await updateTechnician({ id: technician._id, formData }).unwrap();
        if (onSuccess) onSuccess();
        onClose();
      } catch (err) {
        // Error handled below
      }
    }
  };

  return (
    <div className="add-tech-modal-backdrop">
      <div className="add-tech-modal">
        <button className="add-tech-modal-close" onClick={onClose} aria-label="Close">
          <span className="add-tech-modal-close-x">&#10005;</span>
        </button>
        <form onSubmit={handleSubmit} autoComplete="off">
          {isLoading && <div className="add-tech-modal-error-text">Updating...</div>}
          {error && <div className="add-tech-modal-error-text">{error?.data?.message || "Error updating technician."}</div>}
          <div className="add-tech-modal-header">
            <div className="add-tech-modal-title">Edit Technician</div>
            <div className="add-tech-modal-subtitle">Update technician details.</div>
          </div>
          <div className="add-tech-modal-section">
            <div className="add-tech-modal-section-title">Personal Information</div>
            <div className="add-tech-modal-fields">
              <div className="add-tech-modal-row">
                <div className="add-tech-modal-field">
                  <label>First Name*</label>
                  <input
                    type="text"
                    className={errors.firstName && touched.firstName ? "input-error" : ""}
                    value={fields.firstName || ""}
                    onChange={e => handleChange("firstName", e.target.value)}
                  />
                  {errors.firstName && touched.firstName && (
                    <div className="add-tech-modal-error-text">{errors.firstName}</div>
                  )}
                </div>
                <div className="add-tech-modal-field">
                  <label>Last Name*</label>
                  <input
                    type="text"
                    className={errors.lastName && touched.lastName ? "input-error" : ""}
                    value={fields.lastName || ""}
                    onChange={e => handleChange("lastName", e.target.value)}
                  />
                  {errors.lastName && touched.lastName && (
                    <div className="add-tech-modal-error-text">{errors.lastName}</div>
                  )}
                </div>
              </div>
              <div className="add-tech-modal-row">
                <div className="add-tech-modal-field">
                  <label>Email Address*</label>
                  <input
                    type="email"
                    className={errors.email && touched.email ? "input-error" : ""}
                    value={fields.email || ""}
                    onChange={e => handleChange("email", e.target.value)}
                  />
                  {errors.email && touched.email && (
                    <div className="add-tech-modal-error-text">{errors.email}</div>
                  )}
                </div>
                <div className="add-tech-modal-field">
                  <label>Phone*</label>
                  <PhoneInput
                    value={fields.phone || ""}
                    countryCode={fields.countryCode || DEFAULT_COUNTRY_CODE}
                    onCountryCodeChange={(code) =>
                      handleChange("countryCode", code)
                    }
                    onChange={(digits) => handleChange("phone", digits)}
                    error={!!(errors.phone && touched.phone)}
                  />
                  {errors.phone && touched.phone && (
                    <div className="add-tech-modal-error-text">{errors.phone}</div>
                  )}
                </div>
              </div>
              <div className="add-tech-modal-row">
                <div className="add-tech-modal-field" style={{ width: 612 }}>
                  <label>Expertise*</label>
                  <MultiSelectDropdown
                    value={fields.expertise || []}
                    onChange={(value) => handleChange("expertise", value)}
                    options={TECHNICIAN_EXPERTISE_OPTIONS}
                    placeholder="Select expertise (must match job types)"
                    error={errors.expertise && touched.expertise}
                  />
                  {errors.expertise && touched.expertise && (
                    <div className="add-tech-modal-error-text">{errors.expertise}</div>
                  )}
                </div>
              </div>
              <div className="add-tech-modal-row">
                <div className="add-tech-modal-field" style={{ width: 612 }}>
                  <label>Profile Image</label>
                  <label className={`add-tech-modal-upload${errors.profileImage && touched.profileImage ? " input-error" : ""}`}>
                    <span className="add-tech-modal-upload-text">
                      {fields.profileImage
                        ? fields.profileImage.name
                        : (technician.profilePicture ? "Current Image" : "Upload File here")}
                    </span>
                    <img src="/icons/job.svg" alt="Upload" className="add-tech-modal-upload-icon" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleFileChange("profileImage", e)}
                    />
                  </label>
                  {errors.profileImage && touched.profileImage && (
                    <div className="add-tech-modal-error-text">{errors.profileImage}</div>
                  )}
                </div>
              </div>
              <div className="add-tech-modal-row">
                <div className="add-tech-modal-field">
                  <label>Password</label>
                  <div className="add-tech-modal-password">
                    <input
                      type={showPassword ? "text" : "password"}
                      className={errors.password && touched.password ? "input-error" : ""}
                      value={fields.password || ""}
                      onChange={e => handleChange("password", e.target.value)}
                    />
                    <img
                      src="/icons/eye.svg"
                      alt="Show"
                      className="add-tech-modal-eye"
                      onClick={() => setShowPassword((v) => !v)}
                    />
                  </div>
                  {errors.password && touched.password && (
                    <div className="add-tech-modal-error-text">{errors.password}</div>
                  )}
                </div>
                <div className="add-tech-modal-field">
                  <label>Confirm Password</label>
                  <div className="add-tech-modal-password">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      className={errors.confirmPassword && touched.confirmPassword ? "input-error" : ""}
                      value={fields.confirmPassword || ""}
                      onChange={e => handleChange("confirmPassword", e.target.value)}
                    />
                    <img
                      src="/icons/eye.svg"
                      alt="Show"
                      className="add-tech-modal-eye"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                    />
                  </div>
                  {errors.confirmPassword && touched.confirmPassword && (
                    <div className="add-tech-modal-error-text">{errors.confirmPassword}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="add-tech-modal-section">
            <div className="add-tech-modal-section-title">Required Documents</div>
            <div className="add-tech-modal-fields">
              <div className="add-tech-modal-row">
                <div className="add-tech-modal-field">
                  <label>Work Permit Front</label>
                  <label className={`add-tech-modal-upload${errors.workPermitFront && touched.workPermitFront ? " input-error" : ""}`}>
                    <span className="add-tech-modal-upload-text">
                      {fields.workPermitFront
                        ? fields.workPermitFront.name
                        : (technician.workPermitFront ? "Current File" : "Upload File here")}
                    </span>
                    <img src="/icons/job.svg" alt="Upload" className="add-tech-modal-upload-icon" />
                    <input
                      type="file"
                      onChange={e => handleFileChange("workPermitFront", e)}
                    />
                  </label>
                  {errors.workPermitFront && touched.workPermitFront && (
                    <div className="add-tech-modal-error-text">{errors.workPermitFront}</div>
                  )}
                </div>
                <div className="add-tech-modal-field">
                  <label>Work Permit Back</label>
                  <label className={`add-tech-modal-upload${errors.workPermitBack && touched.workPermitBack ? " input-error" : ""}`}>
                    <span className="add-tech-modal-upload-text">
                      {fields.workPermitBack
                        ? fields.workPermitBack.name
                        : (technician.workPermitBack ? "Current File" : "Upload File here")}
                    </span>
                    <img src="/icons/job.svg" alt="Upload" className="add-tech-modal-upload-icon" />
                    <input
                      type="file"
                      onChange={e => handleFileChange("workPermitBack", e)}
                    />
                  </label>
                  {errors.workPermitBack && touched.workPermitBack && (
                    <div className="add-tech-modal-error-text">{errors.workPermitBack}</div>
                  )}
                </div>
              </div>
              <div className="add-tech-modal-row">
                <div className="add-tech-modal-field" style={{ width: 612 }}>
                  <label>Expiration Date</label>
                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      className={`date-picker-button ${errors.workPermitExpiry && touched.workPermitExpiry ? "input-error" : ""}`}
                      onClick={() => setWorkPermitDatePickerOpen(!workPermitDatePickerOpen)}
                    >
                      {fields.workPermitExpiry ? new Date(fields.workPermitExpiry).toLocaleDateString() : "Select date"}
                    </button>
                    {workPermitDatePickerOpen && (
                      <div className="date-picker-modal">
                        <DatePicker
                          value={fields.workPermitExpiry}
                          onChange={(date) => {
                            const dateString = date instanceof Date ? date.toISOString().split('T')[0] : date;
                            handleChange("workPermitExpiry", dateString);
                            setWorkPermitDatePickerOpen(false);
                          }}
                          onClose={() => setWorkPermitDatePickerOpen(false)}
                        />
                      </div>
                    )}
                  </div>
                  {errors.workPermitExpiry && touched.workPermitExpiry && (
                    <div className="add-tech-modal-error-text">{errors.workPermitExpiry}</div>
                  )}
                </div>
              </div>
              <div className="add-tech-modal-row">
                <div className="add-tech-modal-field">
                  <label>Driving License Front</label>
                  <label className={`add-tech-modal-upload${errors.licenseFront && touched.licenseFront ? " input-error" : ""}`}>
                    <span className="add-tech-modal-upload-text">
                      {fields.licenseFront
                        ? fields.licenseFront.name
                        : (technician.drivingLicenseFront ? "Current File" : "Upload File here")}
                    </span>
                    <img src="/icons/job.svg" alt="Upload" className="add-tech-modal-upload-icon" />
                    <input
                      type="file"
                      onChange={e => handleFileChange("licenseFront", e)}
                    />
                  </label>
                  {errors.licenseFront && touched.licenseFront && (
                    <div className="add-tech-modal-error-text">{errors.licenseFront}</div>
                  )}
                </div>
                <div className="add-tech-modal-field">
                  <label>Driving License Back</label>
                  <label className={`add-tech-modal-upload${errors.licenseBack && touched.licenseBack ? " input-error" : ""}`}>
                    <span className="add-tech-modal-upload-text">
                      {fields.licenseBack
                        ? fields.licenseBack.name
                        : (technician.drivingLicenseBack ? "Current File" : "Upload File here")}
                    </span>
                    <img src="/icons/job.svg" alt="Upload" className="add-tech-modal-upload-icon" />
                    <input
                      type="file"
                      onChange={e => handleFileChange("licenseBack", e)}
                    />
                  </label>
                  {errors.licenseBack && touched.licenseBack && (
                    <div className="add-tech-modal-error-text">{errors.licenseBack}</div>
                  )}
                </div>
              </div>
              <div className="add-tech-modal-row">
                <div className="add-tech-modal-field" style={{ width: 612 }}>
                  <label>Expiration Date</label>
                  <div style={{ position: "relative" }}>
                    <button
                      type="button"
                      className={`date-picker-button ${errors.licenseExpiry && touched.licenseExpiry ? "input-error" : ""}`}
                      onClick={() => setLicenseExpiryDatePickerOpen(!licenseExpiryDatePickerOpen)}
                    >
                      {fields.licenseExpiry ? new Date(fields.licenseExpiry).toLocaleDateString() : "Select date"}
                    </button>
                    {licenseExpiryDatePickerOpen && (
                      <div className="date-picker-modal">
                        <DatePicker
                          value={fields.licenseExpiry}
                          onChange={(date) => {
                            const dateString = date instanceof Date ? date.toISOString().split('T')[0] : date;
                            handleChange("licenseExpiry", dateString);
                            setLicenseExpiryDatePickerOpen(false);
                          }}
                          onClose={() => setLicenseExpiryDatePickerOpen(false)}
                        />
                      </div>
                    )}
                  </div>
                  {errors.licenseExpiry && touched.licenseExpiry && (
                    <div className="add-tech-modal-error-text">{errors.licenseExpiry}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <button className="add-tech-modal-submit" type="submit">
              Update
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
