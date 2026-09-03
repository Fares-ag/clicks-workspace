import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGetLeadsQuery } from "../../store/leadApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import DataTable from "../../components/DataTable/DataTable.jsx";
import "../SOSInbox/SOSInbox.css";

const STATUS_COLORS = {
  new: { bg: "#EEF4FF", color: "#3538CD", border: "#C7D7FE", label: "New" },
  contacted: { bg: "#FEF4E6", color: "#F79009", border: "#FECF85", label: "Contacted" },
  qualified: { bg: "#E8F7FF", color: "#0D6EFD", border: "#B8E6FF", label: "Qualified" },
  converted: { bg: "#ECFDF5", color: "#12B76A", border: "#A6F4C5", label: "Converted" },
  lost: { bg: "#F2F4F7", color: "#475467", border: "#D0D5DD", label: "Lost" },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.new;
  return (
    <span
      className="sos-status-badge"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {s.label}
    </span>
  );
}

function Leads() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading, isFetching, refetch } = useGetLeadsQuery({
    page,
    limit: 15,
    search: debouncedSearch,
    status: statusFilter || undefined,
  });

  const leads = data?.leads || [];
  const total = data?.pagination?.total || 0;

  const columns = [
    {
      title: "Lead ID",
      key: "id",
      width: "10%",
      render: (row) => (
        <span className="sos-id-cell">
          #{(row.lead_id || row._id || "").slice(-8).toUpperCase()}
        </span>
      ),
    },
    {
      title: "Customer",
      key: "customer",
      width: "18%",
      render: (row) => (
        <div className="sos-customer-cell">
          <span className="sos-customer-name">{row.clientName || "—"}</span>
          <span className="sos-customer-phone">{row.clientMobileNumber || "—"}</span>
        </div>
      ),
    },
    {
      title: "Inquiry",
      key: "inquiry",
      width: "22%",
      render: (row) => row.inquiry || "—",
    },
    {
      title: "Source",
      key: "source",
      width: "12%",
      render: (row) =>
        typeof row.source === "object"
          ? row.source.mainSourceName
          : row.source || "—",
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
      width: "14%",
      render: (row) => {
        const open = ["new", "contacted", "qualified"].includes(row.status);
        return (
          <button
            className="sos-action-btn"
            onClick={() => navigate(`/leads/${row.lead_id || row._id}`)}
          >
            {open ? "Open" : "View"}
          </button>
        );
      },
    },
  ];

  return (
    <div className="sos-inbox-container">
      <div className="sos-inbox-header-row">
        <div>
          <span className="sos-inbox-title">Leads</span>
          <p className="sos-inbox-subtitle">
            Phone and walk-in inquiries. Convert to a job when the customer commits.
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
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="converted">Converted</option>
            <option value="lost">Lost</option>
          </select>
          <input
            className="sos-inbox-search"
            placeholder="Search name, phone, inquiry…"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
          />
          <button
            className="jobs-add-btn"
            type="button"
            onClick={() => navigate("/leads/new")}
          >
            + Add New Lead
          </button>
          <button className="sos-refresh-btn" type="button" onClick={() => refetch()}>
            Refresh
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={leads}
        loading={isLoading && !data}
        fetching={isFetching && !!data}
        searchPlaceholder="Search…"
        hideFilterIcon={true}
        pagination={{
          current: page,
          total,
          pageSize: 15,
          onChange: (newPage) => setPage(newPage),
        }}
        title="Leads"
      />
    </div>
  );
}

export default Leads;
