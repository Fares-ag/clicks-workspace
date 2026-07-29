import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useGetVehiclesQuery, useToggleVehicleStatusMutation } from "../../store/vehicleApi";
import DataTable from "../../components/DataTable/DataTable.jsx";
import SuccessModal from "../../components/SuccessModal.jsx";
import VehicleFilterDropdown from "../../components/VehicleFilterDropdown.jsx";
import AddVehicleModal from "../../components/AddVehicleModal.jsx";
import EditVehicleModal from "../../components/EditVehicleModal.jsx";
import "./Vehicles.css";

function VehicleStatusToggle({ active, onToggle }) {
  return (
    <button
      className={`vehicle-activation-toggle${active ? " active" : ""}`}
      onClick={onToggle}
    >
      <span
        className="vehicle-activation-toggle-dot"
        style={{ left: active ? 22 : 4 }}
      />
    </button>
  );
}

function VehicleCell({ vehicle }) {
  return (
    <div className="vehicle-name-cell">
      <img
        src={vehicle.vehicleImage || "/icons/car.png"}
        alt="Vehicle"
        className="vehicle-img"
      />
      <span className="vehicle-name-text">{vehicle.make} {vehicle.model}</span>
    </div>
  );
}

function AssignedTechnicianCell({ technician, navigate }) {
  if (!technician) {
    return <span className="vehicle-no-tech">No Technician</span>;
  }

  return (
    <div 
      className="vehicle-tech-cell"
      onClick={() => navigate(`/technicians/${technician._id}`)}
    >
      <img
        src={technician.profileImage || "/icons/user.svg"}
        alt="Technician"
        className="vehicle-tech-img"
      />
      <span className="vehicle-tech-name">
        {technician.firstName} {technician.lastName}
      </span>
    </div>
  );
}

function VehicleActions({ onEdit, onView }) {
  return (
    <div className="vehicle-actions">
      <button className="vehicle-action-btn" onClick={onEdit}>
        <img src="/icons/pencil.svg" alt="Edit" />
      </button>
      <button className="vehicle-action-btn" onClick={onView}>
        <img src="/icons/eye.svg" alt="View" />
      </button>
    </div>
  );
}

function Vehicles() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const filterButtonRef = useRef(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "" });
  const [showSuccess, setShowSuccess] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editVehicleId, setEditVehicleId] = useState(null);

  const { data, isLoading, refetch } = useGetVehiclesQuery({ 
    page, 
    limit: 5, 
    search,
    status: filters.status || undefined
  });
  const [toggleStatus] = useToggleVehicleStatusMutation();

  const vehicles = data?.vehicles || [];
  const total = data?.total || 0;

  const handleToggleActive = async (vehicleId) => {
    try {
      await toggleStatus(vehicleId).unwrap();
    } catch (err) {
      console.error("Error toggling vehicle status:", err);
      alert("Failed to toggle vehicle status");
    }
  };

  const handleEdit = (vehicle) => {
    setEditVehicleId(vehicle._id);
    setEditModalOpen(true);
  };

  const handleSuccess = () => {
    setShowSuccess(true);
    refetch();
  };

  const columns = [
    {
      title: "Vehicle",
      key: "vehicle",
      dataIndex: "vehicle",
      width: "20%",
      render: (row) => (
        <VehicleCell vehicle={{
          ...row,
          make: row.make?.makeName || row.make,
          model: row.model?.modelName || row.model
        }} />
      )
    },
    {
      title: "Plate Number",
      key: "plateNumber",
      dataIndex: "plateNumber",
      width: "15%",
      render: (row) => (
        <span className="vehicle-plate-cell">
          {row.plateNumber}
        </span>
      )
    },
    {
      title: "VIN Number",
      key: "vinNumber",
      dataIndex: "vinNumber",
      width: "20%",
      render: (row) => (
        <span className="vehicle-vin-cell">
          {row.vinNumber}
        </span>
      )
    },
    {
      title: "Assigned Technician",
      key: "assignedTechnician",
      dataIndex: "assignedTechnician",
      width: "20%",
      render: (row) => (
        <AssignedTechnicianCell 
          technician={row.assignedTechnician}
          navigate={navigate}
        />
      )
    },
    {
      title: "Status",
      key: "status",
      dataIndex: "status",
      width: "15%",
      render: (row) => (
        <VehicleStatusToggle
          active={row.isActive}
          onToggle={() => handleToggleActive(row._id)}
        />
      )
    },
    {
      title: "Action",
      key: "action",
      dataIndex: "action",
      width: "10%",
      render: (row) => (
        <VehicleActions
          onEdit={() => handleEdit(row)}
          onView={() => navigate(`/vehicles/${row._id}`)}
        />
      )
    }
  ];

  const handleFilterApply = (newFilters) => {
    setFilters(newFilters);
    setFilterOpen(false);
  };

  const handleSearch = (value) => {
    setSearch(value);
    setPage(1); // Reset to first page when search changes
  };

  return (
    <div className="vehicles-container">
      <div className="vehicles-header-row">
        <span className="vehicles-title">
          Vehicle Management
        </span>
        <div className="vehicles-buttons">
          <button className="vehicles-add-btn" onClick={() => setModalOpen(true)}>
            + Add New Vehicle
          </button>
          <button 
            className="vehicles-config-btn" 
            onClick={() => navigate('/vehicle-makes')}
          >
            Vehicle Configuration
          </button>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={vehicles}
        loading={isLoading}
        onSearch={handleSearch}
        onFilter={() => setFilterOpen(!filterOpen)}
        filterButtonRef={filterButtonRef}
        filterDropdown={
          <VehicleFilterDropdown
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            onApply={handleFilterApply}
            anchorEl={filterButtonRef.current}
          />
        }
        pagination={{
          current: page,
          total: total,
          pageSize: 5,
          onChange: (newPage) => setPage(newPage)
        }}
        title="Vehicles"
      />
      <AddVehicleModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleSuccess}
      />
      <EditVehicleModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        vehicleId={editVehicleId}
        onSuccess={handleSuccess}
      />
      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="Vehicle Updated"
        subtitle="The vehicle was successfully updated."
      />
    </div>
  );
}

export default Vehicles;
