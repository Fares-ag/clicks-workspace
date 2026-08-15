import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGetServiceRequestsQuery } from "../../store/serviceRequestApi";
import DataTable from "../../components/DataTable/DataTable.jsx";
import "../SOSInbox/SOSInbox.css";

const STATUS_COLORS = {
  pending: { bg: "#FEF4E6", color: "#F79009", border: "#FECF85", label: "Pending" },
  assigned: { bg: "#ECFDF5", color: "#12B76A", border: "#A6F4C5", label: "Assigned" },
  cancelled: { bg: "#F2F4F7", color: "#475467", border: "#D0D5DD", label: "Cancelled" },
  completed: { bg: "#ECFDF5", color: "#027A48", border: "#A6F4C5", label: "Completed" },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span
      className="sos-status-badge"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {s.label}
    </span>
  );
}

function ServiceRequestsInbox() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [timingFilter, setTimingFilter] = useState("");

  const { data, isLoading, refetch } = useGetServiceRequestsQuery({
    page,
    limit: 15,
    search,
    status: statusFilter || undefined,
    timing: timingFilter || undefined,
  });

  const requests = data?.requests || [];
  const total = data?.pagination?.total || 0;

  const toJobPayload = (row) => ({
    service_request_id: row.service_request_id || row._id,
    customer_id: row.customer_id,
    customer_vehicle_id: row.customer_vehicle_id,
    customer: row.customer,
    vehicle: row.vehicle,
    location: row.location,
    service_type: row.service_type,
    timing: row.timing,
    scheduled_for: row.scheduled_for,
    status: row.status,
  });

  const handleOpenLead = (row) => {
    if (row.lead_id) {
      navigate(`/leads/${row.lead_id}`);
      return;
    }
    if (row.status === "pending") {
      navigate("/leads/new", { state: { serviceRequestData: toJobPayload(row) } });
      return;
    }
    navigate("/service-requests");
  };

  const columns = [
    {
      title: "Request ID",
      key: "id",
      width: "10%",
      render: (row) => (
        <span className="sos-id-cell">
          #{(row.service_request_id || row._id || "").slice(-8).toUpperCase()}
        </span>
      ),
    },
    {
      title: "Service",
      key: "service",
      width: "14%",
      render: (row) => row.service_type || "—",
    },
    {
      title: "When",
      key: "timing",
      width: "14%",
      render: (row) => {
        if (row.timing === "scheduled" && row.scheduled_for) {
          return (
            <div className="sos-customer-cell">
              <span className="sos-customer-name">Scheduled</span>
              <span className="sos-customer-phone">
                {new Date(row.scheduled_for).toLocaleString()}
              </span>
            </div>
          );
        }
        return "Now";
      },
    },
    {
      title: "Customer",
      key: "customer",
      width: "16%",
      render: (row) => (
        <div className="sos-customer-cell">
          <span className="sos-customer-name">{row.customer?.name || "—"}</span>
          <span className="sos-customer-phone">{row.customer?.phone || "—"}</span>
        </div>
      ),
    },
    {
      title: "Vehicle",
      key: "vehicle",
      width: "14%",
      render: (row) =>
        row.vehicle
          ? `${row.vehicle.year || ""} ${row.vehicle.color || ""} ${row.vehicle.make || ""} ${row.vehicle.model || ""}`.trim()
          : "—",
    },
    {
      title: "Status",
      key: "status",
      width: "10%",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      title: "Actions",
      key: "actions",
      width: "12%",
      render: (row) => {
        const canOpen = row.status === "pending" || row.lead_id;
        return (
          <button
            className="sos-action-btn"
            disabled={!canOpen && row.status !== "assigned"}
            onClick={() => handleOpenLead(row)}
          >
            {row.status === "pending" || row.lead_id ? "Open lead" : "View only"}
          </button>
        );
      },
    },
  ];

  return (
    <div className="sos-inbox-container">
      <div className="sos-inbox-header-row">
        <div>
          <span className="sos-inbox-title">Service Requests</span>
          <p className="sos-inbox-subtitle">
            Non-emergency service bookings. Open the linked lead — convert to a job when the customer commits.
          </p>
        </div>
        <div className="sos-inbox-filters">
          <select
            className="sos-inbox-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Pending + Assigned</option>
            <option value="pending">Pending</option>
            <option value="assigned">Assigned</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
          <select
            className="sos-inbox-select"
            value={timingFilter}
            onChange={(e) => {
              setTimingFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All timing</option>
            <option value="immediate">Now</option>
            <option value="scheduled">Scheduled</option>
          </select>
          <input
            className="sos-inbox-search"
            placeholder="Search name, phone, service…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <button className="sos-refresh-btn" type="button" onClick={() => refetch()}>
            Refresh
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={requests}
        loading={isLoading}
        searchPlaceholder="Search…"
        hideFilterIcon={true}
        pagination={{
          current: page,
          total,
          pageSize: 15,
          onChange: (newPage) => setPage(newPage),
        }}
        title="Service Requests"
      />
    </div>
  );
}

export default ServiceRequestsInbox;
