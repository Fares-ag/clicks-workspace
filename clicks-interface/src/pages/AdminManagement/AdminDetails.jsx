import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGetAdminByIdQuery } from "../../store/adminApi.js";
import EditAdminModal from "../../components/EditAdminModal.jsx";
import "./AdminDetails.css";

function StatusBadge({ isActive }) {
  return (
    <div className={`admin-status-badge ${isActive ? 'active' : 'inactive'}`}>
      {isActive ? 'Active' : 'Inactive'}
    </div>
  );
}

function AdminDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGetAdminByIdQuery(id);
  const [editModalOpen, setEditModalOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="admin-details-wrapper">
        <div className="admin-details-loading">Loading admin details...</div>
      </div>
    );
  }

  if (error || !data?.admin) {
    return (
      <div className="admin-details-wrapper">
        <div className="admin-details-error">Admin not found</div>
      </div>
    );
  }

  const admin = data.admin;

  return (
    <div className="admin-details-wrapper">
      {/* Page Header */}
      <div className="admin-details-header-row">
        <button 
          className="admin-details-back-btn"
          onClick={() => navigate('/admin-management')}
        >
          <img src="/icons/long-arrow-left.svg" alt="Back" />
        </button>
        <h1 className="admin-details-page-title">Admin Details</h1>
      </div>

      <div className="admin-details-container">
        {/* Profile Information Section */}
        <div className="admin-details-profile-section">
          {/* User Image Card */}
          <div className="admin-details-card admin-details-user-card">
            <div className="admin-details-user-info">
              <div className="admin-details-avatar">
                <img 
                  src={admin.profileImage || "/icons/user.svg"} 
                  alt={`${admin.firstName} ${admin.lastName}`}
                />
              </div>
              <div className="admin-details-user-text">
                <h2 className="admin-details-user-name">
                  {admin.firstName} {admin.lastName}
                </h2>
                <p className="admin-details-user-role">{admin.role}</p>
              </div>
            </div>
          </div>

          {/* Personal Information Card */}
          <div className="admin-details-card admin-details-info-card">
            <div className="admin-details-info-content">
              <h3 className="admin-details-info-title">Personal Information</h3>
              
              <div className="admin-details-info-grid">
                {/* Left Column */}
                <div className="admin-details-info-column">
                  <div className="admin-details-info-group">
                    <label className="admin-details-info-label">First Name</label>
                    <p className="admin-details-info-value">{admin.firstName}</p>
                  </div>
                  
                  <div className="admin-details-info-group">
                    <label className="admin-details-info-label">Email address</label>
                    <p className="admin-details-info-value">{admin.email}</p>
                  </div>
                  
                  <div className="admin-details-info-group">
                    <label className="admin-details-info-label">Role</label>
                    <p className="admin-details-info-value">{admin.role}</p>
                  </div>
                </div>

                {/* Right Column */}
                <div className="admin-details-info-column">
                  <div className="admin-details-info-group">
                    <label className="admin-details-info-label">Last Name</label>
                    <p className="admin-details-info-value">{admin.lastName}</p>
                  </div>
                  
                  <div className="admin-details-info-group">
                    <label className="admin-details-info-label">Phone</label>
                    <p className="admin-details-info-value">{admin.phone}</p>
                  </div>
                  
                  <div className="admin-details-info-group">
                    <label className="admin-details-info-label">Status</label>
                    <StatusBadge isActive={admin.isActive} />
                  </div>
                </div>
              </div>
            </div>

            {/* Edit Button */}
            <button 
              className="admin-details-edit-btn"
              onClick={() => setEditModalOpen(true)}
            >
              <img src="/icons/pencil.svg" alt="Edit" />
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <EditAdminModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        adminId={id}
        onSuccess={() => {
          setEditModalOpen(false);
        }}
      />
    </div>
  );
}

export default AdminDetails;
