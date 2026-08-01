import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  useGetVehicleInsurancesQuery,
  useCreateVehicleInsuranceMutation,
  useUpdateVehicleInsuranceMutation
} from "../../store/vehicleInsuranceApi";
import DataTable from "../../components/DataTable/DataTable.jsx";
import SuccessModal from "../../components/SuccessModal.jsx";
import InsuranceFilterDropdown from "../../components/InsuranceFilterDropdown.jsx";
import AddInsuranceModal from "../../components/AddInsuranceModal.jsx";
import EditInsuranceModal from "../../components/EditInsuranceModal.jsx";
import "./VehicleInsurance.css";


function InsuranceStatusToggle({ active, onToggle }) {
  return (
    <button
      className={`insurance-activation-toggle${active ? " active" : ""}`}
      onClick={onToggle}
    >
      <span
        className="insurance-activation-toggle-dot"
        style={{ left: active ? 22 : 4 }}
      />
    </button>
  );
}

function InsuranceStatusPill({ status }) {
  const statusLabels = {
    "active": "Active",
    "expiring": "Expiring",
    "expired": "Expired"
  };

  return (
    <span className={`insurance-status-pill ${status}`}>
      {statusLabels[status] || status}
    </span>
  );
}

function VehicleCell({ vehicle }) {
  return (
    <div className="insurance-vehicle-cell">
      <img
        src={vehicle.vehicleImage || "/icons/car.png"}
        alt="Vehicle"
        className="insurance-vehicle-img"
      />
      <div className="insurance-vehicle-info">
        <div className="insurance-vehicle-name">{vehicle.make} {vehicle.model}</div>
        <div className="insurance-vehicle-plate">{vehicle.plateNumber}</div>
      </div>
    </div>
  );
}

function InsuranceActions({ onEdit /*, onView */ }) {
  return (
    <div className="insurance-actions">
      <button className="insurance-action-btn" onClick={onEdit}>
        <img src="/icons/pencil.svg" alt="Edit" />
      </button>
      {/* View button temporarily disabled
      <button className="insurance-action-btn" onClick={onView}>
        <img src="/icons/eye.svg" alt="View" />
      </button>
      */}
    </div>
  );
}

function VehicleInsurance() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const filterButtonRef = useRef(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editInsuranceId, setEditInsuranceId] = useState(null);

  const { data, isLoading, refetch } = useGetVehicleInsurancesQuery({
    page,
    limit: 5,
    search,
    status: filters.status || undefined
  });
  const [createInsurance] = useCreateVehicleInsuranceMutation();
  const [updateInsurance] = useUpdateVehicleInsuranceMutation();

  const insuranceData = data?.insurances || [];
  const total = data?.total || 0;

  const handleToggleActive = async (insuranceId, currentStatus) => {
    try {
      const newStatus = currentStatus === "Active" ? "Inactive" : "Active";
      await updateInsurance({ id: insuranceId, status: newStatus }).unwrap();
      refetch();
    } catch (err) {
      console.error("Error toggling insurance activation:", err);
      alert("Failed to update insurance status");
    }
  };

  const handleEdit = (insurance) => {
    setEditInsuranceId(insurance._id);
    setEditModalOpen(true);
  };

  const handleAddSuccess = async (formData) => {
    try {
      await createInsurance(formData).unwrap();
      setModalOpen(false);
      setShowSuccess(true);
      refetch();
    } catch (error) {
      console.error("Error creating insurance:", error);
      alert(error?.data?.message || "Failed to create insurance. Please try again.");
    }
  };

  const handleEditSuccess = () => {
    setShowSuccess(true);
    refetch();
  };

  const columns = [
    {
      title: "Insurance ID",
      key: "insuranceId",
      dataIndex: "insuranceId",
      width: "120px",
      render: (row) => (
        <span className="insurance-id-cell">
          {row.insuranceId || "N/A"}
        </span>
      )
    },
    {
      title: "Vehicle",
      key: "vehicle",
      dataIndex: "vehicle",
      width: "180px",
      render: (row) => (
        <VehicleCell vehicle={{
          make: row.make?.makeName || "",
          model: row.model?.modelName || "",
          year: row.year,
          plateNumber: row.plateNumber,
          vehicleImage: ""
        }} />
      )
    },
    {
      title: "VIN Number",
      key: "vinNumber",
      dataIndex: "vinNumber",
      width: "flex",
      render: (row) => (
        <span className="insurance-vin-cell">
          {row.vinNumber}
        </span>
      )
    },
    {
      title: "Client Name",
      key: "clientName",
      dataIndex: "clientName",
      width: "flex",
      render: (row) => (
        <span className="insurance-client-cell">
          {row.clientName}
        </span>
      )
    },
    {
      title: "Subscription Plan",
      key: "subscriptionType",
      dataIndex: "subscriptionType",
      width: "flex",
      render: (row) => (
        <span className="insurance-plan-cell">
          {row.subscriptionType}
        </span>
      )
    },
    {
      title: "Start Date",
      key: "startDate",
      dataIndex: "startDate",
      width: "flex",
      render: (row) => (
        <span className="insurance-date-cell">
          {new Date(row.startDate).toLocaleDateString()}
        </span>
      )
    },
    {
      title: "End Date",
      key: "endDate",
      dataIndex: "endDate",
      width: "flex",
      render: (row) => (
        <span className="insurance-date-cell">
          {new Date(row.endDate).toLocaleDateString()}
        </span>
      )
    },
    {
      title: "Activation",
      key: "activation",
      dataIndex: "activation",
      width: "flex",
      render: (row) => (
        <InsuranceStatusToggle
          active={row.status === "Active"}
          onToggle={() => handleToggleActive(row._id, row.status)}
        />
      )
    },
    {
      title: "Status",
      key: "status",
      dataIndex: "status",
      width: "flex",
      render: (row) => (
        <InsuranceStatusPill status={row.status === "Active" ? "active" : "expired"} />
      )
    },
    {
      title: "Action",
      key: "action",
      dataIndex: "action",
      width: "120px",
      render: (row) => (
        <InsuranceActions
          onEdit={() => handleEdit(row)}
          /* onView={() => navigate(`/vehicle-insurance/${row._id}`)} */
        />
      )
    }
  ];

  const handleFilterApply = (newFilters) => {
    setFilters(newFilters);
    setFilterOpen(false);
    setPage(1); // Reset to first page when filters change
  };

  const handleSearch = (value) => {
    setSearch(value);
    setPage(1); // Reset to first page when search changes
  };

  return (
    <div className="vehicle-insurance-container">
      <div className="vehicle-insurance-header-row">
        <span className="vehicle-insurance-title">
          Subscriptions
        </span>
        <button className="vehicle-insurance-add-btn" onClick={() => setModalOpen(true)}>
          + Add New Subscription
        </button>
      </div>
      <DataTable
        columns={columns}
        data={insuranceData}
        loading={isLoading}
        onSearch={handleSearch}
        onFilter={() => setFilterOpen(!filterOpen)}
        filterButtonRef={filterButtonRef}
        filterDropdown={
          <InsuranceFilterDropdown
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
        title="Subscriptions"
        hasBorders={true}
      />
      <AddInsuranceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleAddSuccess}
      />
      <EditInsuranceModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        insuranceId={editInsuranceId}
        onSuccess={handleEditSuccess}
      />
      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="Insurance Updated"
        subtitle="The vehicle insurance was successfully updated."
      />
    </div>
  );
}

export default VehicleInsurance;
