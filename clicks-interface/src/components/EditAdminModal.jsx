import React, { useState, useEffect } from "react";
import { 
  useGetAdminByIdQuery, 
  useUpdateAdminMutation 
} from "../store/adminApi.js";
import CustomSelect from "./CustomSelect.jsx";
import PhoneInput from "./PhoneInput.jsx";
import {
  DEFAULT_COUNTRY_CODE,
  isValidLocalPhone,
  toE164,
  toLocalDigits,
} from "../utils/phone";
import "./AddAdminModal.css";

const initialErrors = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: ""
};

export default function EditAdminModal({ open, onClose, adminId, onSuccess }) {
  const { data: adminData, isLoading: isLoadingAdmin } = useGetAdminByIdQuery(adminId, {
    skip: !open || !adminId
  });
  const [updateAdmin, { isLoading: isUpdating }] = useUpdateAdminMutation();

  const [fields, setFields] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    countryCode: DEFAULT_COUNTRY_CODE,
    profileImage: null,
    role: ""
  });

  const [errors, setErrors] = useState(initialErrors);
  const [touched, setTouched] = useState({});

  useEffect(() => {
    if (open && adminData?.admin) {
      const admin = adminData.admin;
      setFields({
        firstName: admin.firstName || "",
        lastName: admin.lastName || "",
        email: admin.email || "",
        phone: toLocalDigits(admin.phone || "", DEFAULT_COUNTRY_CODE),
        countryCode: DEFAULT_COUNTRY_CODE,
        profileImage: null,
        role: admin.role || ""
      });
      setTouched({});
      setErrors(initialErrors);
    }
  }, [open, adminData]);

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
    else if (!isValidLocalPhone(fields.phone)) {
      newErrors.phone = "Enter the 8-digit local number (without +974).";
    }
    if (!fields.role) newErrors.role = "Role required.";
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
      role: true
    });

    if (!validate()) return;

    try {
      const formData = new FormData();
      Object.keys(fields).forEach((key) => {
        if (key === "countryCode") return;
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

      await updateAdmin({ id: adminId, ...Object.fromEntries(formData) }).unwrap();
      
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error("Error updating admin:", error);
      // Handle error (show error message, etc.)
    }
  };

  const handleClose = () => {
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
          {isUpdating && <div className="add-admin-modal-error-text">Submitting...</div>}
          <div className="add-admin-modal-header">
            <div className="add-admin-modal-title">Edit Admin</div>
            <div className="add-admin-modal-subtitle">Update admin details</div>
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
                  <label>Profile Image</label>
                  <label className="add-admin-modal-upload">
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
                  <div style={{ fontSize: '12px', color: '#667085', marginTop: '4px' }}>
                    Current: {adminData?.admin?.profileImage || "No image"}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <button className="add-admin-modal-submit" type="submit" disabled={isUpdating || isLoadingAdmin}>
              {isUpdating ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
