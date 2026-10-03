import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useGetTechnicianActivityQuery,
  useGetTechnicianActivityFiltersQuery,
  useGetTechnicianActivitySummaryQuery,
  useLazyExportTechnicianActivityCSVQuery,
} from "../../store/technicianActivityApi";
import DataTable from "../../components/DataTable/DataTable.jsx";
import "./TechnicianLogs.css";

const PAGE_SIZE = 25;

/** Local datetime-local value -> ISO, so the API filter matches what was picked. */
function toIso(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Qatar",
  });
}

function SeverityBadge({ severity, outcome, label }) {
  // Failures and blocks always read as problems, whatever the event's severity.
  const tone =
    outcome === "failure" ? "alert" : outcome === "blocked" ? "warn" : severity || "info";
  return <span className={`tech-log-badge tech-log-badge-${tone}`}>{label}</span>;
}

function MetadataCell({ row }) {
  const [open, setOpen] = useState(false);
  const details = [];

  if (row.job_reference) details.push(`Job ID ${row.job_reference}`);
  if (row.coordinates) {
    details.push(
      `${row.coordinates.latitude.toFixed(5)}, ${row.coordinates.longitude.toFixed(5)}`
    );
  }
  if (row.ip) details.push(row.ip);
  if (row.app_version) details.push(`v${row.app_version}`);

  const hasJson = row.metadata && Object.keys(row.metadata).length > 0;

  return (
    <div className="tech-log-meta">
      <span className="tech-log-meta-summary">{details.join(" · ") || "—"}</span>
      {hasJson && (
        <>
          <button
            type="button"
            className="tech-log-meta-toggle"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide details" : "Details"}
          </button>
          {open && (
            <pre className="tech-log-meta-json">
              {JSON.stringify(row.metadata, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

function TechnicianLogs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const technicianIdParam = searchParams.get("technician") || "";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [event, setEvent] = useState("");
  const [outcome, setOutcome] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterButtonRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const queryArgs = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      search: debouncedSearch,
      technician_id: technicianIdParam || undefined,
      category: category || undefined,
      event: event || undefined,
      outcome: outcome || undefined,
      from: toIso(from),
      to: toIso(to),
    }),
    [page, debouncedSearch, technicianIdParam, category, event, outcome, from, to]
  );

  const { data, isLoading, isFetching } = useGetTechnicianActivityQuery(queryArgs);
  const { data: filterData } = useGetTechnicianActivityFiltersQuery();
  const { data: summary } = useGetTechnicianActivitySummaryQuery({
    days: 7,
    technician_id: technicianIdParam || undefined,
  });
  const [exportCSV, { isLoading: isExporting }] =
    useLazyExportTechnicianActivityCSVQuery();

  const logs = data?.logs || [];
  const total = data?.pagination?.total || 0;

  // Only show events for the chosen category, so the dropdown stays usable.
  const eventOptions = useMemo(() => {
    const all = filterData?.events || [];
    return category ? all.filter((option) => option.category === category) : all;
  }, [filterData, category]);

  const handleExport = async () => {
    try {
      const csv = await exportCSV(queryArgs).unwrap();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `technician-activity-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to export the log. Please try again.");
    }
  };

  const clearFilters = () => {
    setCategory("");
    setEvent("");
    setOutcome("");
    setFrom("");
    setTo("");
    setPage(1);
    if (technicianIdParam) {
      searchParams.delete("technician");
      setSearchParams(searchParams, { replace: true });
    }
  };

  const activeFilterCount = [
    category,
    event,
    outcome,
    from,
    to,
    technicianIdParam,
  ].filter(Boolean).length;

  const columns = [
    {
      title: "When",
      key: "at",
      width: "16%",
      render: (row) => <span className="tech-log-when">{formatWhen(row.at)}</span>,
    },
    {
      title: "Technician",
      key: "technician",
      width: "18%",
      render: (row) => (
        <div className="tech-log-tech">
          <span className="tech-log-tech-name">
            {row.technician?.name || "Unknown account"}
          </span>
          <span className="tech-log-tech-phone">
            {row.technician?.phone || row.identifier || "—"}
          </span>
        </div>
      ),
    },
    {
      title: "Event",
      key: "event",
      width: "18%",
      render: (row) => (
        <SeverityBadge
          severity={row.severity}
          outcome={row.outcome}
          label={row.event_label}
        />
      ),
    },
    {
      title: "Details",
      key: "message",
      width: "30%",
      render: (row) => (
        <div className="tech-log-message">
          <span>{row.message}</span>
          <MetadataCell row={row} />
        </div>
      ),
    },
    {
      title: "Device",
      key: "device",
      width: "18%",
      render: (row) => (
        <div className="tech-log-device">
          <span>{row.platform || row.user_agent?.slice(0, 28) || "—"}</span>
          {row.status_code ? (
            <span className="tech-log-status-code">HTTP {row.status_code}</span>
          ) : null}
        </div>
      ),
    },
  ];

  const filterDropdown = filterOpen ? (
    <div className="tech-log-filter-panel">
      <div className="tech-log-filter-row">
        <label>
          Category
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setEvent("");
              setPage(1);
            }}
          >
            <option value="">All</option>
            {(filterData?.categories || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Event
          <select
            value={event}
            onChange={(e) => {
              setEvent(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {eventOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tech-log-filter-row">
        <label>
          Outcome
          <select
            value={outcome}
            onChange={(e) => {
              setOutcome(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {(filterData?.outcomes || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="tech-log-filter-row">
        <label>
          From
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          To
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      <div className="tech-log-filter-actions">
        <button type="button" onClick={clearFilters}>
          Clear all
        </button>
        <button
          type="button"
          className="tech-log-filter-apply"
          onClick={() => setFilterOpen(false)}
        >
          Done
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="tech-logs-container">
      <div className="tech-logs-header">
        <div>
          <h1 className="tech-logs-title">Technician Logs</h1>
          <p className="tech-logs-subtitle">
            Every action in the technician app — logins (including failed
            attempts), availability, job steps and device events.
          </p>
        </div>
        <button
          type="button"
          className="tech-logs-export"
          onClick={handleExport}
          disabled={isExporting || total === 0}
        >
          {isExporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {summary ? (
        <div className="tech-logs-summary">
          <div className="tech-logs-stat">
            <span className="tech-logs-stat-value">{summary.total}</span>
            <span className="tech-logs-stat-label">
              events in the last {summary.days} days
            </span>
          </div>
          <div className="tech-logs-stat tech-logs-stat-alert">
            <span className="tech-logs-stat-value">{summary.failed_logins || 0}</span>
            <span className="tech-logs-stat-label">failed logins</span>
          </div>
          <div className="tech-logs-stat-events">
            {(summary.events || []).slice(0, 5).map((item) => (
              <button
                type="button"
                key={item.event}
                className="tech-logs-chip"
                onClick={() => {
                  setEvent(item.event);
                  setCategory("");
                  setPage(1);
                }}
              >
                {item.label} <strong>{item.count}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {technicianIdParam ? (
        <div className="tech-logs-scope">
          Showing one technician only.
          <button type="button" onClick={clearFilters}>
            Show everyone
          </button>
        </div>
      ) : null}

      <DataTable
        title="Activity"
        columns={columns}
        data={logs}
        loading={isLoading}
        fetching={isFetching}
        onSearch={setSearch}
        searchPlaceholder="Search name, phone or typed number…"
        onFilter={() => setFilterOpen((v) => !v)}
        filterDropdown={filterDropdown}
        filterButtonRef={filterButtonRef}
        filterButtonText={
          activeFilterCount ? `Filter (${activeFilterCount})` : "Filter"
        }
        actionIcons={[]}
        hasBorders
        pagination={{
          current: page,
          total,
          pageSize: PAGE_SIZE,
          onChange: setPage,
        }}
      />
    </div>
  );
}

export default TechnicianLogs;
