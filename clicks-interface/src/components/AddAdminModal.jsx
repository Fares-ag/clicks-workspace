import React, { useState } from "react";
import { useCreateAdminMutation } from "../store/adminApi.js";
import CustomSelect from "./CustomSelect.jsx";
import PhoneInput from "./PhoneInput.jsx";
import {
  DEFAULT_COUNTRY_CODE,
  isValidLocalPhone,
  localLengthHint,
  toE164,
} from "../utils/phone";
import "./AddAdminModal.css";

const initialErrors = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  profileImage: "",
  password: "",
  confirmPassword: "",
  role: ""
};

export default function AddAdminModal({ open, onClose, onSuccess }) {
  const [createAdmin, { isLoading: isCreating }] = useCreateAdminMutation();
  
  const [fields, setFields] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    countryCode: DEFAULT_COUNTRY_CODE,
    profileImage: null,
    password: "",
    confirmPassword: "",
    role: ""
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState(initialErrors);
  const [touched, setTouched] = useState({});

  if (!open) return null;

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
    const newErrors = { ...initialErrors };
    if (!fields.firstName) newErrors.firstName = "First Name required.";
    if (!fields.lastName) newErrors.lastName = "Last Name required.";
    if (!fields.email) newErrors.email = "Email Address required.";
    if (!fields.phone) newErrors.phone = "Phone required.";
    else if (!isValidLocalPhone(fields.phone, fields.countryCode)) {
      const cc = fields.countryCode || DEFAULT_COUNTRY_CODE;
      newErrors.phone = `Enter the ${localLengthHint(cc)} local number (without ${cc}).`;
    }
    if (!fields.profileImage) newErrors.profileImage = "Profile Image required.";
    if (!fields.role) newErrors.role = "Role required.";
    if (!fields.password) {
      newErrors.password = "Please enter password.\nPassword must be at least 8 characters, including numbers and special characters.";
    } else if (
      fields.password.length < 8 ||
      !/\d/.test(fields.password) ||
      !/[!@#$%^&*(),.?":{}|<>]/.test(fields.password)
    ) {
      newErrors.password = "Password must be at least 8 characters, including numbers and special characters.";
    }
    if (!fields.confirmPassword) newErrors.confirmPassword = "Confirm Password required.";
    if (fields.password && fields.confirmPassword && fields.password !== fields.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match.";
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
      profileImage: true,
      password: true,
      confirmPassword: true,
      role: true
    });

    if (!validate()) return;

    try {
      // Prepare form data
      const formData = new FormData();
      Object.keys(fields).forEach((key) => {
        if (key === "confirmPassword" || key === "countryCode") return;
        if (key === "phone") {
          formData.append(
            "phone",
            toE164(fields.phone, fields.countryCode || DEFAULT_COUNTRY_CODE)
          );
          return;
        }
        if (fields[key] !== null && fields[key] !== "") {
          formData.append(key, fields[key]);
        }
      });

      await createAdmin(formData).unwrap();
      
      if (onSuccess) onSuccess();
      onClose();
      
      // Reset form
      setFields({
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        countryCode: DEFAULT_COUNTRY_CODE,
        profileImage: null,
        password: "",
        confirmPassword: "",
        role: ""
      });
      setTouched({});
      setErrors(initialErrors);
    } catch (error) {
      console.error("Error creating admin:", error);
      // Handle error (show error message, etc.)
    }
  };

  const handleClose = () => {
    setFields({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      countryCode: DEFAULT_COUNTRY_CODE,
      profileImage: null,
      password: "",
      confirmPassword: "",
      role: ""
    });
    setTouched({});
    setErrors(initialErrors);
    onClose();
  };

  return (
    <div className="add-admin-modal-backdrop">
      <div className="add-admin-modal">
        <button className="add-admin-modal-close" onClick={handleClose} aria-label="Close">
          <span className="add-admin-modal-close-x">&#10005;</span>
        </button>
        <form onSubmit={handleSubmit} autoComplete="off">
          {isCreating && <div className="add-admin-modal-error-text">Submitting...</div>}
          <div className="add-admin-modal-header">
            <div className="add-admin-modal-title">Add New Admin</div>
            <div className="add-admin-modal-subtitle">Add your admin details</div>
          </div>
          <div className="add-admin-modal-section">
            <div className="add-admin-modal-section-title">Personal Information</div>
            <div className="add-admin-modal-fields">
              <div className="add-admin-modal-row">
                <div className="add-admin-modal-field">
                  <label>First Name*</label>
                  <input
                    type="text"
                    className={errors.firstName && touched.firstName ? "input-error" : ""}
                    value={fields.firstName}
                    onChange={e => handleChange("firstName", e.target.value)}
                  />
                  {errors.firstName && touched.firstName && (
                    <div className="add-admin-modal-error-text">{errors.firstName}</div>
                  )}
                </div>
                <div className="add-admin-modal-field">
                  <label>Last Name*</label>
                  <input
                    type="text"
                    className={errors.lastName && touched.lastName ? "input-error" : ""}
                    value={fields.lastName}
                    onChange={e => handleChange("lastName", e.target.value)}
                  />
                  {errors.lastName && touched.lastName && (
                    <div className="add-admin-modal-error-text">{errors.lastName}</div>
                  )}
                </div>
              </div>
              <div className="add-admin-modal-row">
                <div className="add-admin-modal-field" style={{ width: 612 }}>
                  <label>Role*</label>
                  <CustomSelect
                    value={fields.role}
                    onChange={(value) => handleChange("role", value)}
                    options={[
                      { value: "Admin", label: "Admin" },
                      { value: "Super Admin", label: "Super Admin" },
                      { value: "Job Dispatcher", label: "Job Dispatcher" },
                      { value: "Coordinator", label: "Coordinator" },
                      { value: "Call Center Agent", label: "Call Center Agent" }
                    ]}
                    placeholder="Select role"
                    error={errors.role && touched.role}
                  />
                  {errors.role && touched.role && (
                    <div className="add-admin-modal-error-text">{errors.role}</div>
                  )}
                </div>
              </div>
              <div className="add-admin-modal-row">
                <div className="add-admin-modal-field">
                  <label>Email Address*</label>
                  <input
                    type="email"
                    className={errors.email && touched.email ? "input-error" : ""}
                    value={fields.email}
                    onChange={e => handleChange("email", e.target.value)}
                  />
                  {errors.email && touched.email && (
                    <div className="add-admin-modal-error-text">{errors.email}</div>
                  )}
                </div>
                <div className="add-admin-modal-field">
                  <label>Phone*</label>
                  <PhoneInput
                    value={fields.phone}
                    countryCode={fields.countryCode || DEFAULT_COUNTRY_CODE}
                    onCountryCodeChange={(code) =>
                      handleChange("countryCode", code)
                    }
                    onChange={(digits) => handleChange("phone", digits)}
                    error={!!(errors.phone && touched.phone)}
                  />
                  {errors.phone && touched.phone && (
                    <div className="add-admin-modal-error-text">{errors.phone}</div>
                  )}
                </div>
              </div>
              <div className="add-admin-modal-row">
                <div className="add-admin-modal-field" style={{ width: 612 }}>
                  <label>Profile Image*</label>
                  <label className={`add-admin-modal-upload${errors.profileImage && touched.profileImage ? " input-error" : ""}`}>
                    <span className="add-admin-modal-upload-text">
                      {fields.profileImage ? fields.profileImage.name : "Upload File here"}
                    </span>
                    <img src="/icons/job.svg" alt="Upload" className="add-admin-modal-upload-icon" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleFileChange("profileImage", e)}
                    />
                  </label>
                  {errors.profileImage && touched.profileImage && (
                    <div className="add-admin-modal-error-text">{errors.profileImage}</div>
                  )}
                </div>
              </div>
              <div className="add-admin-modal-row">
                <div className="add-admin-modal-field">
                  <label>Password*</label>
                  <div className="add-admin-modal-password">
                    <input
                      type={showPassword ? "text" : "password"}
                      className={errors.password && touched.password ? "input-error" : ""}
                      value={fields.password}
                      onChange={e => handleChange("password", e.target.value)}
                    />
                    <img
                      src="/icons/eye.svg"
                      alt="Show"
                      className="add-admin-modal-eye"
                      onClick={() => setShowPassword((v) => !v)}
                    />
                  </div>
                  {errors.password && touched.password && (
                    <div className="add-admin-modal-error-text">{errors.password}</div>
                  )}
                </div>
                <div className="add-admin-modal-field">
                  <label>Confirm Password*</label>
                  <div className="add-admin-modal-password">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      className={errors.confirmPassword && touched.confirmPassword ? "input-error" : ""}
                      value={fields.confirmPassword}
                      onChange={e => handleChange("confirmPassword", e.target.value)}
                    />
                    <img
                      src="/icons/eye.svg"
                      alt="Show"
                      className="add-admin-modal-eye"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                    />
                  </div>
                  {errors.confirmPassword && touched.confirmPassword && (
                    <div className="add-admin-modal-error-text">{errors.confirmPassword}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <button className="add-admin-modal-submit" type="submit" disabled={isCreating}>
              {isCreating ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
