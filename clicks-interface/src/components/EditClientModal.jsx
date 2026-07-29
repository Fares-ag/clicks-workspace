import React, { useState, useEffect } from "react";
import { useGetCustomerByIdQuery, useUpdateCustomerMutation } from "../store/customerApi";
import "./EditClientModal.css";

export default function EditClientModal({ open, onClose, clientId, onSuccess }) {
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: ""
  });

  const { data: customerData } = useGetCustomerByIdQuery(clientId, {
    skip: !clientId || !open
  });
  const [updateCustomer, { isLoading }] = useUpdateCustomerMutation();

  useEffect(() => {
    if (customerData?.customer) {
      const customer = customerData.customer;
      setFormData({
        first_name: customer.first_name || "",
        last_name: customer.last_name || "",
        email: customer.email || ""
      });
    }
  }, [customerData]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateCustomer({ id: clientId, ...formData }).unwrap();
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Error updating client:", error);
      alert("Failed to update client. Please try again.");
    }
  };

  const handleClose = () => {
    setFormData({ first_name: "", last_name: "", email: "" });
    onClose();
  };

  return (
    <div className="edit-client-modal-backdrop" onClick={handleClose}>
      <div className="edit-client-modal" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button className="edit-client-modal-close" onClick={handleClose}>
          <div className="edit-client-modal-close-icon">✕</div>
        </button>

        <form onSubmit={handleSubmit}>
          {/* Title and Subtitle */}
          <div className="edit-client-modal-header">
            <h2 className="edit-client-modal-title">Edit User Information</h2>
            <p className="edit-client-modal-subtitle">
              Update your details to keep your profile up-to-date.
            </p>
          </div>

          {/* Inputs */}
          <div className="edit-client-modal-inputs">
            <h3 className="edit-client-modal-section-title">Personal Information</h3>

            {/* First Name and Last Name Row */}
            <div className="edit-client-modal-row">
              <div className="edit-client-modal-field">
                <label>First Name*</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  required
                />
              </div>

              <div className="edit-client-modal-field">
                <label>Last Name*</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Email and Phone Row */}
            <div className="edit-client-modal-row">
              <div className="edit-client-modal-field">
                <label>Email Address*</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="edit-client-modal-field">
                <label className="edit-client-modal-disabled-label">Phone*</label>
                <input
                  type="text"
                  value={customerData?.customer?.phone_number || ""}
                  disabled
                  className="edit-client-modal-disabled-input"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="edit-client-modal-footer">
              <button type="submit" className="edit-client-modal-submit" disabled={isLoading}>
                {isLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
