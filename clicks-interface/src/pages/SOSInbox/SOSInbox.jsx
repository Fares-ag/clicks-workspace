import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { message } from "antd";
import {
  useGetSOSRequestsQuery,
  useClaimSOSMutation,
  useClaimNextSOSMutation,
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

const AGE_WARN_SECONDS = 2 * 60;
const AGE_URGENT_SECONDS = 5 * 60;

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

function ageSecondsFor(row, nowMs) {
  if (row.createdAt) {
    return Math.max(0, Math.round((nowMs - new Date(row.createdAt).getTime()) / 1000));
  }
  return Number.isFinite(row.age_seconds) ? row.age_seconds : 0;
}

function formatAge(seconds) {
  const s = Math.max(0, seconds || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function EscalationBadge({ level }) {
  const n = Number(level) || 0;
  if (n < 1) return null;
  return <span className={`sos-escalation-badge sos-escalation-badge--l${n}`}>L{n}</span>;
}

function SOSInbox() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [claimSOS, { isLoading: claiming }] = useClaimSOSMutation();
  const [claimNextSOS, { isLoading: claimingNext }] = useClaimNextSOSMutation();
  const busy = claiming || claimingNext;
  const openQueue = statusFilter === "pending" || statusFilter === "in_call";

  const { data, isLoading, isFetching, refetch } = useGetSOSRequestsQuery({
    page,
    limit: 15,
    search: debouncedSearch,
    status: statusFilter || undefined,
    sort: openQueue ? "oldest" : undefined,
  });

  const requests = data?.requests || [];
  const total = data?.pagination?.total || 0;
  const queue = data?.queue || { pending: 0, in_call: 0 };
  const oncallConfigured = data?.ops?.oncall_configured !== false;

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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

  const claimErrorMessage = (err) => {
    const code = err?.data?.code;
    if (code === "SOS_ALREADY_CLAIMED") return "Already claimed by another dispatcher.";
    if (code === "SOS_UNAVAILABLE") return "SOS is no longer available.";
    if (code === "SOS_QUEUE_EMPTY") return "No unclaimed pending SOS.";
    return err?.data?.error || "Failed to claim SOS";
  };

  const goToJob = (row) => {
    navigate("/jobs/new", { state: { sosData: toJobPayload(row) } });
  };

  const handleCreateJob = async (row) => {
    const actionable = row.status === "pending" || row.status === "in_call";
    if (!actionable) {
      message.warning("This SOS can no longer be converted to a job.");
      return;
    }
    try {
      await claimSOS(row.sos_id || row._id).unwrap();
      goToJob(row);
    } catch (err) {
      message.error(claimErrorMessage(err));
      refetch();
    }
  };

  const handleTakeNext = async () => {
    try {
      const result = await claimNextSOS().unwrap();
      if (result?.request) {
        goToJob(result.request);
      }
    } catch (err) {
      message.error(claimErrorMessage(err));
      refetch();
    }
  };

  const setFilter = (value) => {
    setStatusFilter(value);
    setPage(1);
  };

  const columns = [
    {
      title: "SOS ID",
      key: "sosId",
      width: "11%",
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
      width: "16%",
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
      width: "16%",
      render: (row) =>
        row.vehicle
          ? `${row.vehicle.year || ""} ${row.vehicle.color || ""} ${row.vehicle.make || ""} ${row.vehicle.model || ""}`.trim()
          : "—",
    },
    {
      title: "Status",
      key: "status",
      width: "12%",
      mobile: { featured: true, order: 0 },
      render: (row) => (
        <span className="sos-status-stack">
          <StatusBadge status={displayStatus(row)} />
          <EscalationBadge level={row.escalation_level} />
        </span>
      ),
    },
    {
      title: "Age",
      key: "age",
      width: "10%",
      mobile: { featured: true, order: 3 },
      render: (row) => {
        const age = ageSecondsFor(row, nowMs);
        const urgent = age >= AGE_URGENT_SECONDS;
        const warn = age >= AGE_WARN_SECONDS;
        return (
          <span
            className={`sos-age-badge${urgent ? " sos-age-badge--urgent" : warn ? " sos-age-badge--warn" : ""}`}
          >
            {formatAge(age)}
          </span>
        );
      },
    },
    {
      title: "Cancel reason",
      key: "cancelReason",
      width: "13%",
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
      title: "Updated",
      key: "time",
      width: "12%",
      render: (row) => {
        const t = row.updatedAt || row.expires_at;
        return t ? new Date(t).toLocaleString() : "—";
      },
    },
    {
      title: "Actions",
      key: "actions",
      width: "12%",
      render: (row) => {
        const canJob = row.status === "pending" || row.status === "in_call";
        return (
          <button
            className="sos-action-btn"
            disabled={!canJob || busy}
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
            {openQueue
              ? "Live queue, oldest first. Take the next unclaimed request — do not cherry-pick."
              : "Full register of emergency requests, including cancelled and completed."}
          </p>
        </div>
        <div className="sos-inbox-filters">
          <div className="sos-queue-chips" role="group" aria-label="Open SOS counts">
            <button
              type="button"
              className={`sos-queue-chip${statusFilter === "pending" ? " is-active" : ""}`}
              onClick={() => setFilter("pending")}
            >
              Pending {queue.pending ?? 0}
            </button>
            <button
              type="button"
              className={`sos-queue-chip${statusFilter === "in_call" ? " is-active" : ""}`}
              onClick={() => setFilter("in_call")}
            >
              In call {queue.in_call ?? 0}
            </button>
          </div>
          <select
            className="sos-inbox-select"
            value={statusFilter}
            onChange={(e) => setFilter(e.target.value)}
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
          <div className="sos-inbox-actions">
            <button
              className="sos-action-btn"
              type="button"
              disabled={busy || (queue.pending || 0) < 1}
              onClick={handleTakeNext}
            >
              {claimingNext ? "Claiming…" : "Take next oldest"}
            </button>
            <button className="sos-refresh-btn sos-action-btn--ghost" type="button" onClick={() => refetch()}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {data?.ops && !oncallConfigured ? (
        <div className="sos-oncall-banner" role="status">
          Level-2 SMS has nowhere to go. Set on-call phones in Ops Settings (or ONCALL_PHONE)
          so a surge pages a real number, not only logged-in admins.
        </div>
      ) : null}

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
        getRowClassName={(row) => {
          if (row.status !== "pending" && row.status !== "in_call") return "";
          const age = ageSecondsFor(row, nowMs);
          if (age >= AGE_URGENT_SECONDS) return "sos-row sos-row--urgent";
          if (age >= AGE_WARN_SECONDS) return "sos-row sos-row--warn";
          return "sos-row";
        }}
      />
    </div>
  );
}

export default SOSInbox;
