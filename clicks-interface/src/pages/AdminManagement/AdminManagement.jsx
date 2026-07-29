import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import DataTable from "../../components/DataTable/DataTable.jsx";
import SuccessModal from "../../components/SuccessModal.jsx";
import FilterDropdown from "../../components/FilterDropdown.jsx";
import AddAdminModal from "../../components/AddAdminModal.jsx";
import EditAdminModal from "../../components/EditAdminModal.jsx";
import {
  useGetAdminsQuery,
  useToggleAdminStatusMutation
} from "../../store/adminApi.js";
import "./AdminManagement.css";

function AdminStatusToggle({ active, onToggle }) {
  return (
    <button
      className={`admin-activation-toggle${active ? " active" : ""}`}
      onClick={onToggle}
    >
      <span
        className="admin-activation-toggle-dot"
        style={{ left: active ? 18 : 2 }}
      />
    </button>
  );
}

function AdminActions({ onEdit, onView }) {
  return (
    <div className="admin-actions">
      <button className="admin-action-btn" onClick={onEdit}>
        <img src="/icons/pencil.svg" alt="Edit" />
      </button>
      <button className="admin-action-btn" onClick={onView}>
        <img src="/icons/eye.svg" alt="View" />
      </button>
    </div>
  );
}

function AdminManagement() {
  const navigate = useNavigate();
  const filterButtonRef = useRef(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editAdminId, setEditAdminId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // API Hooks
  const { data, isLoading, refetch } = useGetAdminsQuery({
    page: currentPage,
    limit: 5,
    search: searchTerm,
    role: filters.role || undefined,
    status: filters.status === "Active" ? true : filters.status === "Inactive" ? false : undefined
  });
  const [toggleAdminStatus] = useToggleAdminStatusMutation();

  const handleToggleActive = async (adminId, currentStatus) => {
    try {
      await toggleAdminStatus({ 
        id: adminId, 
        isActive: !currentStatus 
      }).unwrap();
      refetch();
    } catch (err) {
      console.error("Error toggling admin status:", err);
    }
  };

  const handleEdit = (admin) => {
    setEditAdminId(admin._id);
    setEditModalOpen(true);
  };

  const handleSearch = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const columns = [
    {
      title: "Profile Photo",
      key: "profilePhoto",
      dataIndex: "profilePhoto",
      width: "127px",
      render: (row) => (
        <div className="admin-profile-photo-cell">
          <img
            src={row.profileImage || "/icons/user.svg"}
            alt="Admin"
            className="admin-name-img"
          />
        </div>
      )
    },
    {
      title: "Name",
      key: "name",
      dataIndex: "name",
      width: "flex",
      render: (row) => (
        <span className="admin-name-text">
          {`${row.firstName} ${row.lastName}`}
        </span>
      )
    },
    {
      title: "Phone Number",
      key: "phone",
      dataIndex: "phone",
      width: "flex",
      render: (row) => (
        <span className="admin-phone-cell">
          {row.phone}
        </span>
      )
    },
    {
      title: "Email",
      key: "email",
      dataIndex: "email",
      width: "203px",
      render: (row) => (
        <span className="admin-email-cell">
          {row.email}
        </span>
      )
    },
    {
      title: "Role",
      key: "role",
      dataIndex: "role",
      width: "136px",
      render: (row) => (
        <span className="admin-role-cell">
          {row.role}
        </span>
      )
    },
    {
      title: "Status",
      key: "status",
      dataIndex: "status",
      width: "flex",
      render: (row) => (
        <AdminStatusToggle
          active={row.isActive}
          onToggle={() => handleToggleActive(row._id, row.isActive)}
        />
      )
    },
    {
      title: "Action",
      key: "action",
      dataIndex: "action",
      width: "120px",
      render: (row) => (
        <AdminActions
          onEdit={() => handleEdit(row)}
          onView={() => navigate(`/admin-management/${row._id}`)}
        />
      )
    }
  ];

  const handleFilterApply = (newFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
    setFilterOpen(false);
  };

  return (
    <div className="admin-management-container">
      <div className="admin-management-header-row">
        <span className="admin-management-title">
          Admin Management
        </span>
        <button className="admin-management-add-btn" onClick={() => setModalOpen(true)}>
          + Add New Admin
        </button>
      </div>
      <DataTable
        columns={columns}
        data={data?.admins || []}
        loading={isLoading}
        onSearch={handleSearch}
        onFilter={() => setFilterOpen(!filterOpen)}
        filterButtonRef={filterButtonRef}
        filterDropdown={
          <FilterDropdown
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            onApply={handleFilterApply}
            anchorEl={filterButtonRef.current}
          />
        }
        pagination={{
          current: currentPage,
          total: data?.total || 0,
          pageSize: 5,
          onChange: handlePageChange
        }}
        title="Admins"
      />
      <AddAdminModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setShowSuccess(true);
          setModalOpen(false);
          refetch();
        }}
      />
      <EditAdminModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        adminId={editAdminId}
        onSuccess={() => {
          setShowSuccess(true);
          setEditModalOpen(false);
          refetch();
        }}
      />
      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="Admin Updated"
        subtitle="The admin was successfully updated."
      />
    </div>
  );
}

export default AdminManagement;
