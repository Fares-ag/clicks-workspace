import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { message } from "antd";
import {
  useGetSOSRequestsQuery,
  useClaimSOSMutation,
} from "../../store/sosApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import DataTable from "../../components/DataTable/DataTable.jsx";
import { formatCancelReason } from "../../utils/cancelReasonLabels.js";
import { getJobStatusLabel, JOB_STATUS_LABELS } from "../../utils/jobStatusLabels";
import "./SOSInbox.css";

const STATUS_COLORS = {
  pending: { bg: "#FEF4E6", color: "#F79009", border: "#FECF85", label: "Pending" },
  in_call: { bg: "#E8F7FF", color: "#0D6EFD", border: "#B8E6FF", label: "In Call" },
  expired: { bg: "#FEF3F2", color: "#D92D20", border: "#FECDCA", label: "Expired" },
  accepted: { bg: "#ECFDF5", color: "#12B76A", border: "#A6F4C5", label: "Accepted" },
  cancelled: { bg: "#F2F4F7", color: "#475467", border: "#D0D5DD", label: "Cancelled" },
  completed: { bg: "#ECFDF5", color: "#027A48", border: "#A6F4C5", label: "Completed" },
  assigned: { bg: "#F4F3FF", color: "#5925DC", border: "#D9D6FE" },
  en_route: { bg: "#EFF8FF", color: "#175CD3", border: "#B2DDFF" },
  arrived: { bg: "#F0F9FF", color: "#026AA2", border: "#B9E6FE" },
  in_progress: { bg: "#FFF6ED", color: "#C4320A", border: "#FDDCAB" },
};

function displayStatus(row) {
  return row.display_status || row.job_status || row.status;
}

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.pending;
  const label = JOB_STATUS_LABELS[status]
    ? getJobStatusLabel(status)
    : s.label || getJobStatusLabel(status);
  return (
    <span
      className="sos-status-badge"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {label}
    </span>
  );
}

function SOSInbox() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [statusFilter, setStatusFilter] = useState("");
  const [claimSOS, { isLoading: claiming }] = useClaimSOSMutation();

  const { data, isLoading, isFetching, refetch } = useGetSOSRequestsQuery({
    page,
    limit: 15,
    search: debouncedSearch,
    status: statusFilter || undefined,
  });

  const requests = data?.requests || [];
  const total = data?.pagination?.total || 0;

  const toJobPayload = (row) => ({
    sos_id: row.sos_id || row._id,
    customer_id: row.customer_id,
    customer_vehicle_id: row.customer_vehicle_id,
    customer: row.customer,
    vehicle: row.vehicle,
    location: row.location,
    expires_at: row.expires_at,
    status: row.status,
  });

  const handleCreateJob = async (row) => {
    const actionable = row.status === "pending" || row.status === "in_call";
    if (!actionable) {
      message.warning("This SOS can no longer be converted to a job.");
      return;
    }
    try {
      await claimSOS(row.sos_id || row._id).unwrap();
      navigate("/jobs/new", { state: { sosData: toJobPayload(row) } });
    } catch (err) {
      const code = err?.data?.code;
      if (code === "SOS_ALREADY_CLAIMED") {
        message.error("Already claimed by another dispatcher.");
      } else if (code === "SOS_UNAVAILABLE") {
        message.error("SOS is no longer available.");
      } else {
        message.error(err?.data?.error || "Failed to claim SOS");
      }
      refetch();
    }
  };

  const columns = [
    {
      title: "SOS ID",
      key: "sosId",
      width: "12%",
      mobile: { featured: true, order: 1 },
      render: (row) => (
        <span className="sos-id-cell">
          #{(row.sos_id || row._id || "").slice(-8).toUpperCase()}
        </span>
      ),
    },
    {
      title: "Customer",
      key: "customer",
      width: "18%",
      mobile: { order: 2 },
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
      width: "18%",
      render: (row) =>
        row.vehicle
          ? `${row.vehicle.year || ""} ${row.vehicle.color || ""} ${row.vehicle.make || ""} ${row.vehicle.model || ""}`.trim()
          : "—",
    },
    {
      title: "Status",
      key: "status",
      width: "10%",
      mobile: { featured: true, order: 0 },
      render: (row) => <StatusBadge status={displayStatus(row)} />,
    },
    {
      title: "Cancel reason",
      key: "cancelReason",
      width: "16%",
      render: (row) =>
        row.status === "cancelled" ? (
          <span className="sos-cancel-reason" title={row.cancel_reason || ""}>
            {formatCancelReason(row.cancel_reason)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      title: "Expires / Updated",
      key: "time",
      width: "14%",
      render: (row) => {
        const t = row.expires_at || row.updatedAt;
        return t ? new Date(t).toLocaleString() : "—";
      },
    },
    {
      title: "Actions",
      key: "actions",
      width: "14%",
      render: (row) => {
        const canJob = row.status === "pending" || row.status === "in_call";
        return (
          <button
            className="sos-action-btn"
            disabled={!canJob || claiming}
            onClick={() => handleCreateJob(row)}
          >
            {canJob ? "Create job" : "View only"}
          </button>
        );
      },
    },
  ];

  return (
    <div className="sos-inbox-container">
      <div className="sos-inbox-header-row">
        <div>
          <span className="sos-inbox-title">SOS Inbox</span>
          <p className="sos-inbox-subtitle">
            Full register of emergency requests, including cancelled and completed.
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
            <option value="">All requests</option>
            <option value="pending">Pending</option>
            <option value="in_call">In Call</option>
            <option value="expired">Expired</option>
            <option value="accepted">Accepted</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
          <input
            className="sos-inbox-search"
            placeholder="Search name, phone, plate…"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
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
        loading={isLoading && !data}
        fetching={isFetching && !!data}
        hideSearch={true}
        hideFilterIcon={true}
        pagination={{
          current: page,
          total,
          pageSize: 15,
          onChange: (newPage) => setPage(newPage),
        }}
        title="SOS Requests"
        hideTitle
      />
    </div>
  );
}

export default SOSInbox;
