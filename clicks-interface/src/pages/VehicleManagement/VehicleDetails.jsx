import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useGetVehicleByIdQuery, useUnassignTechnicianMutation } from "../../store/vehicleApi";
import EditVehicleModal from "../../components/EditVehicleModal";
import ConfirmationModal from "../../components/ConfirmationModal";
import SuccessModal from "../../components/SuccessModal";
import "./VehicleDetails.css";

export default function VehicleDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGetVehicleByIdQuery(id);
  const [unassignTechnician, { isLoading: isUnassigning }] = useUnassignTechnicianMutation();
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showUnassignConfirm, setShowUnassignConfirm] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState({ title: "", subtitle: "" });

  if (isLoading) {
    return (
      <div className="vehicle-details-container">
        <div className="vehicle-details-loading">Loading vehicle details...</div>
      </div>
    );
  }

  if (error || !data?.vehicle) {
    return (
      <div className="vehicle-details-container">
        <div className="vehicle-details-error">Error loading vehicle details.</div>
      </div>
    );
  }

  const vehicle = data.vehicle;

  const handleViewDocument = (docUrl) => {
    if (docUrl) {
      window.open(docUrl, '_blank');
    }
  };

  const handleUnassignTechnician = async () => {
    setShowUnassignConfirm(true);
  };

  const confirmUnassignTechnician = async () => {
    try {
      await unassignTechnician(id).unwrap();
      setSuccessMessage({
        title: "Technician Unassigned",
        subtitle: "The technician has been successfully unassigned from this vehicle."
      });
      setShowSuccessModal(true);
    } catch (error) {
      alert('Failed to unassign technician: ' + (error.data?.message || error.message));
    }
  };

  const handleUpdateTechnician = () => {
    setShowEditModal(true);
  };

  const handleEditVehicle = () => {
    setShowEditModal(true);
  };

  const handleUpdateDocument = () => {
    setShowEditModal(true);
  };

  return (
    <div className="vehicle-details-container">
      {/* Breadcrumb */}
      <div className="vehicle-details-breadcrumb">
        <h1 className="vehicle-details-page-title">Vehicles Management</h1>
        <div className="vehicle-details-breadcrumb-nav">
          <span 
            className="vehicle-details-breadcrumb-link"
            onClick={() => navigate('/vehicles')}
          >
            Vehicles
          </span>
          <img src="/icons/long-arrow-right.svg" alt="Arrow" className="vehicle-details-breadcrumb-arrow" />
          <span className="vehicle-details-breadcrumb-current">Vehicle Management</span>
        </div>
      </div>

      {/* Main Card */}
      <div className="vehicle-details-card">
        {/* Title */}
        <div className="vehicle-details-header">
          <h2 className="vehicle-details-title">Vehicle Details</h2>
        </div>

        {/* Vehicle and Technician Section */}
        <div className="vehicle-details-top-section">
          {/* Vehicle Info */}
          <div className="vehicle-details-vehicle-section">
            <div className="vehicle-details-section-content">
              <h3 className="vehicle-details-section-title">Vehicle</h3>
              <div className="vehicle-details-vehicle-display">
                <div className="vehicle-details-vehicle-image">
                  {vehicle.vehicleImage ? (
                    <img src={vehicle.vehicleImage} alt={`${vehicle.make?.makeName} ${vehicle.model?.modelName}`} />
                  ) : (
                    <img src="/icons/car.png" alt="Vehicle" />
                  )}
                </div>
                <div className="vehicle-details-vehicle-info">
                  <h4 className="vehicle-details-vehicle-name">
                    {vehicle.make?.makeName} {vehicle.model?.modelName}
                  </h4>
                  <p className="vehicle-details-vehicle-plate">{vehicle.plateNumber}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Assigned Technician */}
          <div className="vehicle-details-technician-section">
            <div className="vehicle-details-section-content-full">
              <h3 className="vehicle-details-section-title">Assigned Technician</h3>
              {vehicle.assignedTechnician ? (
                <>
                  <div className="vehicle-details-technician-display">
                    <div className="vehicle-details-tech-avatar">
                      <img 
                        src={vehicle.assignedTechnician.profilePicture || "/icons/user.svg"} 
                        alt={vehicle.assignedTechnician.firstName}
                      />
                    </div>
                    <div className="vehicle-details-tech-info">
                      <h4 className="vehicle-details-tech-name">
                        {vehicle.assignedTechnician.firstName} {vehicle.assignedTechnician.lastName}
                      </h4>
                      <div className="vehicle-details-tech-contact">
                        <span>{vehicle.assignedTechnician.email}</span>
                        <span className="vehicle-details-divider"></span>
                        <span>{vehicle.assignedTechnician.phone}</span>
                        <span className="vehicle-details-divider"></span>
                        <button 
                          className="vehicle-details-unassign-link"
                          onClick={handleUnassignTechnician}
                        >
                          Unassign technician
                        </button>
                      </div>
                    </div>
                  </div>
                  <button 
                    className="vehicle-details-btn-primary"
                    onClick={handleUpdateTechnician}
                  >
                    Update Assigned Technician
                  </button>
                </>
              ) : (
                <div className="vehicle-details-no-technician">
                  <p>No technician assigned</p>
                  <button 
                    className="vehicle-details-btn-primary"
                    onClick={handleUpdateTechnician}
                  >
                    Assign Technician
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Vehicle Information Section */}
        <div className="vehicle-details-info-section">
          <div className="vehicle-details-info-header">
            <h3 className="vehicle-details-section-title">Vehicle Information</h3>
            <button 
              className="vehicle-details-btn-edit"
              onClick={handleEditVehicle}
            >
              <img src="/icons/pencil.svg" alt="Edit" />
              Edit
            </button>
          </div>

          <div className="vehicle-details-info-grid">
            <div className="vehicle-details-info-column">
              <div className="vehicle-details-info-item">
                <span className="vehicle-details-info-label">Make</span>
                <span className="vehicle-details-info-value">{vehicle.make?.makeName || 'N/A'}</span>
              </div>
              <div className="vehicle-details-info-item">
                <span className="vehicle-details-info-label">Year</span>
                <span className="vehicle-details-info-value">{vehicle.year || 'N/A'}</span>
              </div>
              <div className="vehicle-details-info-item">
                <span className="vehicle-details-info-label">VIN Number</span>
                <span className="vehicle-details-info-value">{vehicle.vinNumber || 'N/A'}</span>
              </div>
            </div>

            <div className="vehicle-details-info-column">
              <div className="vehicle-details-info-item">
                <span className="vehicle-details-info-label">Model</span>
                <span className="vehicle-details-info-value">{vehicle.model?.modelName || 'N/A'}</span>
              </div>
              <div className="vehicle-details-info-item">
                <span className="vehicle-details-info-label">Plate Number</span>
                <span className="vehicle-details-info-value">{vehicle.plateNumber || 'N/A'}</span>
              </div>
              <div className="vehicle-details-info-item">
                <span className="vehicle-details-info-label">Color</span>
                <span className="vehicle-details-info-value">{vehicle.color || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Car Registration Section */}
          <div className="vehicle-details-registration">
            <h3 className="vehicle-details-section-title">Car Registration</h3>
            
            <div className="vehicle-details-documents">
              <div className="vehicle-details-document-item">
                <span className="vehicle-details-document-label">Car Registration (Estimara Front)</span>
                {vehicle.estimaraFront ? (
                  <div className="vehicle-details-document-card" onClick={() => handleViewDocument(vehicle.estimaraFront)}>
                    <img src="/icons/li_images.svg" alt="Document" className="vehicle-details-document-icon" />
                    <div className="vehicle-details-document-info">
                      <span className="vehicle-details-document-name">Estimara Front</span>
                      <div className="vehicle-details-document-view">
                        <span>Click to view</span>
                        <img src="/icons/eye.svg" alt="View" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="vehicle-details-document-card-empty">
                    <span>No document uploaded</span>
                  </div>
                )}
              </div>

              <div className="vehicle-details-document-item">
                <span className="vehicle-details-document-label">Car Registration (Estimara Back)</span>
                {vehicle.estimaraBack ? (
                  <div className="vehicle-details-document-card" onClick={() => handleViewDocument(vehicle.estimaraBack)}>
                    <img src="/icons/li_images.svg" alt="Document" className="vehicle-details-document-icon" />
                    <div className="vehicle-details-document-info">
                      <span className="vehicle-details-document-name">Estimara Back</span>
                      <div className="vehicle-details-document-view">
                        <span>Click to view</span>
                        <img src="/icons/eye.svg" alt="View" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="vehicle-details-document-card-empty">
                    <span>No document uploaded</span>
                  </div>
                )}
              </div>
            </div>

            <div className="vehicle-details-validity">
              <div className="vehicle-details-validity-info">
                <span>Valid until </span>
                <span className="vehicle-details-validity-date">
                  {vehicle.estimaraExpiration ? new Date(vehicle.estimaraExpiration).toLocaleDateString('en-US', { 
                    month: '2-digit', 
                    day: '2-digit', 
                    year: 'numeric' 
                  }) : 'Not set'}
                </span>
              </div>
              <button className="vehicle-details-update-doc" onClick={handleUpdateDocument}>
                Update Document
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Vehicle Modal */}
      {showEditModal && (
        <EditVehicleModal
          open={showEditModal}
          vehicleId={id}
          vehicle={vehicle}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            setSuccessMessage({
              title: "Vehicle Updated",
              subtitle: "The vehicle information has been successfully updated."
            });
            setShowSuccessModal(true);
            // Data will auto-refresh due to RTK Query cache invalidation
          }}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={showUnassignConfirm}
        onClose={() => setShowUnassignConfirm(false)}
        onConfirm={confirmUnassignTechnician}
        title="Unassign Technician"
        message="Are you sure you want to unassign this technician from the vehicle?"
      />

      {/* Success Modal */}
      <SuccessModal
        open={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title={successMessage.title}
        subtitle={successMessage.subtitle}
      />
    </div>
  );
}

