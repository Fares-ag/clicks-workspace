import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGetCustomerByIdQuery } from "../../store/customerApi";
import "./ClientDetails.css";

export default function ClientDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGetCustomerByIdQuery(id);

  if (isLoading) {
    return (
      <div className="client-details-wrapper">
        <div className="client-details-loading">Loading client details...</div>
      </div>
    );
  }

  if (error || !data?.customer) {
    return (
      <div className="client-details-wrapper">
        <div className="client-details-error">Error loading client details.</div>
      </div>
    );
  }

  const customer = data.customer;

  return (
    <div className="client-details-wrapper">
      {/* Page Header */}
      <div className="client-details-header-row">
        <button 
          className="client-details-back-btn"
          onClick={() => navigate('/clients')}
        >
          <img src="/icons/long-arrow-left.svg" alt="Back" />
        </button>
        <h1 className="client-details-page-title">Client Management</h1>
      </div>

      <div className="client-details-container">
        {/* Header with Title */}
        <div className="client-details-header">
          <h2 className="client-details-title">Client Details</h2>
        </div>

        {/* Personal Information */}
        <div className="client-details-section">
          <h3 className="client-details-section-title">Personal Information</h3>
          <div className="client-details-info-grid">
            <div className="client-details-info-group">
              <div className="client-details-label">First Name</div>
              <div className="client-details-value">{customer.first_name}</div>
            </div>
            <div className="client-details-info-group">
              <div className="client-details-label">Last Name</div>
              <div className="client-details-value">{customer.last_name}</div>
            </div>
            <div className="client-details-info-group">
              <div className="client-details-label">Email Address</div>
              <div className="client-details-value">{customer.email}</div>
            </div>
            <div className="client-details-info-group">
              <div className="client-details-label">Phone Number</div>
              <div className="client-details-value">{customer.phone_number}</div>
            </div>
            <div className="client-details-info-group">
              <div className="client-details-label">Status</div>
              <div className="client-details-value">
                <span className={`client-details-status ${customer.status === 'Active' ? 'active' : 'inactive'}`}>
                  {customer.status}
                </span>
              </div>
            </div>
            <div className="client-details-info-group">
              <div className="client-details-label">Member Since</div>
              <div className="client-details-value">
                {new Date(customer.createdAt).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Account Activity */}
        <div className="client-details-section">
          <h3 className="client-details-section-title">Account Activity</h3>
          <div className="client-details-info-grid">
            <div className="client-details-info-group">
              <div className="client-details-label">Last Updated</div>
              <div className="client-details-value">
                {new Date(customer.updatedAt).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </div>
            </div>
            {customer.deletion_request?.requested_at && (
              <div className="client-details-info-group">
                <div className="client-details-label">Deletion Request</div>
                <div className="client-details-value">
                  {new Date(customer.deletion_request.requested_at).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </div>
              </div>
            )}
          </div>
          {customer.deletion_request?.reason && (
            <div className="client-details-deletion-reason">
              <div className="client-details-label">Deletion Reason</div>
              <div className="client-details-value">{customer.deletion_request.reason}</div>
              {customer.deletion_request.other_reason && (
                <div className="client-details-value client-details-other-reason">
                  {customer.deletion_request.other_reason}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
