import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useGetSupportTicketsQuery } from "../../store/supportTicketApi";
import DataTable from "../../components/DataTable/DataTable.jsx";
import "./SupportTickets.css";

const STATUS_COLORS = {
  pending: { bg: "#FEF4E6", color: "#F79009", border: "#FECF85", label: "Pending" },
  in_progress: { bg: "#E8F7FF", color: "#0D6EFD", border: "#B8E6FF", label: "In Progress" },
  resolved: { bg: "#ECFDF5", color: "#12B76A", border: "#A6F4C5", label: "Resolved" }
};

const SOURCE_LABELS = {
  customer_app: "Customer App",
  technician_app: "Technician App",
  public_website: "Website"
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span
      className="ticket-status-badge"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {s.label}
    </span>
  );
}

function SourceBadge({ source }) {
  return (
    <span className="ticket-source-badge">
      {SOURCE_LABELS[source] || source || "Unknown"}
    </span>
  );
}

function SupportTickets() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const filterButtonRef = useRef(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  const { data, isLoading } = useGetSupportTicketsQuery({
    page,
    limit: 10,
    search,
    status: statusFilter || undefined,
    source: sourceFilter || undefined
  });

  const tickets = data?.requests || [];
  const total = data?.pagination?.total || 0;

  const getSubmitterName = (ticket) => {
    if (ticket.name) return ticket.name;
    if (ticket.user_id) {
      const u = ticket.user_id;
      const first = u.firstName || u.first_name || "";
      const last = u.lastName || u.last_name || "";
      return `${first} ${last}`.trim() || "—";
    }
    return "—";
  };

  const getSubmitterContact = (ticket) => {
    if (ticket.email) return ticket.email;
    if (ticket.user_id) {
      return ticket.user_id.email || ticket.user_id.phone_number || ticket.user_id.phone || "—";
    }
    return "—";
  };

  const columns = [
    {
      title: "Ticket ID",
      key: "ticketId",
      dataIndex: "_id",
      width: "12%",
      render: (row) => (
        <span className="ticket-id-cell">
          #{(row._id || "").slice(-8).toUpperCase()}
        </span>
      )
    },
    {
      title: "Submitter",
      key: "submitter",
      width: "18%",
      render: (row) => (
        <div className="ticket-submitter-cell">
          <span className="ticket-submitter-name">{getSubmitterName(row)}</span>
          <span className="ticket-submitter-contact">{getSubmitterContact(row)}</span>
        </div>
      )
    },
    {
      title: "Issue",
      key: "issue",
      dataIndex: "issue",
      width: "18%",
      render: (row) => <span className="ticket-issue-cell">{row.issue}</span>
    },
    {
      title: "Description",
      key: "description",
      dataIndex: "description",
      width: "22%",
      render: (row) => (
        <span className="ticket-desc-cell" title={row.description}>
          {row.description?.length > 80
            ? row.description.slice(0, 80) + "..."
            : row.description}
        </span>
      )
    },
    {
      title: "Source",
      key: "source",
      dataIndex: "source",
      width: "10%",
      render: (row) => <SourceBadge source={row.source} />
    },
    {
      title: "Status",
      key: "status",
      dataIndex: "status",
      width: "10%",
      render: (row) => <StatusBadge status={row.status} />
    },
    {
      title: "Date",
      key: "date",
      dataIndex: "createdAt",
      width: "10%",
      render: (row) => (
        <span className="ticket-date-cell">
          {new Date(row.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
          })}
        </span>
      )
    },
    {
      title: "Action",
      key: "action",
      width: "5%",
      render: (row) => (
        <div className="ticket-actions">
          <button className="ticket-action-btn" onClick={() => navigate(`/support-tickets/${row._id}`)}>
            <img src="/icons/eye.svg" alt="View" />
          </button>
        </div>
      )
    }
  ];

  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  const handleRowClick = (ticket) => {
    navigate(`/support-tickets/${ticket._id}`);
  };

  return (
    <div className="support-tickets-container">
      <div className="support-tickets-header-row">
        <span className="support-tickets-title">Support Tickets</span>
        <div className="support-tickets-filters">
          <select
            className="support-tickets-select"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
          <select
            className="support-tickets-select"
            value={sourceFilter}
            onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Sources</option>
            <option value="customer_app">Customer App</option>
            <option value="technician_app">Technician App</option>
            <option value="public_website">Website</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={tickets}
        loading={isLoading}
        onSearch={handleSearch}
        searchPlaceholder="Search tickets..."
        pagination={{
          current: page,
          total,
          pageSize: 10,
          onChange: (newPage) => setPage(newPage)
        }}
        title="Support Tickets"
        hideFilterIcon={true}
      />

    </div>
  );
}

export default SupportTickets;
