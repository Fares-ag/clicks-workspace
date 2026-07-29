import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGetCustomersQuery } from "../../store/customerApi";
import DataTable from "../../components/DataTable/DataTable.jsx";
import SuccessModal from "../../components/SuccessModal.jsx";
import FilterDropdown from "../../components/FilterDropdown.jsx";
import EditClientModal from "../../components/EditClientModal.jsx";
import "./ClientManagement.css";

function ClientStatusToggle({ active, onToggle }) {
  return (
    <button
      className={`client-activation-toggle${active ? " active" : ""}`}
      onClick={onToggle}
    >
      <span
        className="client-activation-toggle-dot"
        style={{ left: active ? 22 : 4 }}
      />
    </button>
  );
}

function ClientUserCell({ client }) {
  return (
    <div className="client-user-cell">
      <img
        src={client.profileImage || "/icons/user.svg"}
        alt="Client"
        className="client-user-img"
      />
      <div className="client-user-info">
        <div className="client-user-name">
          {client.firstName} {client.lastName}
        </div>
        <div className="client-user-email">
          {client.email}
        </div>
      </div>
    </div>
  );
}

function ClientActions({ onEdit, onView }) {
  return (
    <div className="client-actions">
      <button className="client-action-btn" onClick={onEdit}>
        <img src="/icons/pencil.svg" alt="Edit" />
      </button>
      <button className="client-action-btn" onClick={onView}>
        <img src="/icons/eye.svg" alt="View" />
      </button>
    </div>
  );
}

function ClientManagement() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editClientId, setEditClientId] = useState(null);

  const { data, isLoading, refetch } = useGetCustomersQuery({
    page,
    limit: 5,
    search
  });

  const customers = data?.customers || [];
  const total = data?.total || 0;

  const handleToggleActive = async (clientId) => {
    try {
      // API call to toggle client status
      console.log("Toggle client status:", clientId);
      refetch();
    } catch (err) {
      console.error("Error toggling client status:", err);
    }
  };

  const handleEdit = (client) => {
    setEditClientId(client._id);
    setEditModalOpen(true);
  };

  const handleSuccess = () => {
    setShowSuccess(true);
    refetch();
  };

  const columns = [
    {
      title: "Client ID",
      key: "clientId",
      dataIndex: "clientId",
      width: "15%",
      render: (row) => (
        <span className="client-id-cell">
          {row.client_id || 'N/A'}
        </span>
      )
    },
    {
      title: "User",
      key: "user",
      dataIndex: "user",
      width: "35%",
      render: (row) => (
        <ClientUserCell client={{
          ...row,
          firstName: row.first_name,
          lastName: row.last_name,
          profileImage: row.profileImage
        }} />
      )
    },
    {
      title: "Phone Number",
      key: "phoneNumber",
      dataIndex: "phoneNumber",
      width: "20%",
      render: (row) => (
        <span className="client-phone-cell">
          {row.phone_number}
        </span>
      )
    },
    {
      title: "Status",
      key: "status",
      dataIndex: "status",
      width: "15%",
      render: (row) => (
        <ClientStatusToggle
          active={row.status === "Active"}
          onToggle={() => handleToggleActive(row._id)}
        />
      )
    },
    {
      title: "Action",
      key: "action",
      dataIndex: "action",
      width: "15%",
      render: (row) => (
        <ClientActions
          onEdit={() => handleEdit(row)}
          onView={() => navigate(`/clients/${row._id}`)}
        />
      )
    }
  ];

  const handleFilterApply = (newFilters) => {
    setFilters(newFilters);
    console.log("Filters applied:", newFilters);
  };

  return (
    <div className="client-management-container">
      <div className="client-management-header-row">
        <span className="client-management-title">
          Client Management
        </span>
      </div>
      <DataTable
        columns={columns}
        data={customers}
        loading={isLoading}
        onFilter={() => setFilterOpen(!filterOpen)}
        filterDropdown={
          <FilterDropdown
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            onApply={handleFilterApply}
          />
        }
        pagination={{
          current: page,
          total: total,
          pageSize: 5,
          onChange: (newPage) => setPage(newPage)
        }}
        title="Clients"
      />
      <EditClientModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        clientId={editClientId}
        onSuccess={handleSuccess}
      />
      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="Client Updated"
        subtitle="The client was successfully updated."
      />
    </div>
  );
}

export default ClientManagement;
