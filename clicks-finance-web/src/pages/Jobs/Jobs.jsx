import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import DataTable from "../../components/DataTable/DataTable.jsx";
import { useListJobsQuery, useListTechniciansQuery, useListVendorsQuery } from "../../store/portalApi";
import "./Jobs.css";

const PAYMENT_METHODS = [
  { value: "card", label: "Card" },
  { value: "wallet", label: "Wallet" },
  { value: "cash", label: "Cash" },
  { value: "fawran", label: "Fawran" },
];

const PAYMENT_METHOD_LABELS = PAYMENT_METHODS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

function AuditStatusPill({ status }) {
  const audited = status === "audited";
  return (
    <span className={`job-audit-pill ${audited ? "audited" : "pending"}`}>
      {audited ? "Audited" : "Not audited"}
    </span>
  );
}

// Pinned to Qatar time: the From/To filters resolve as Qatar calendar days
// server-side and the CSV renders Qatar time, so a viewer on another timezone
// would otherwise see a table that disagrees with both.
function formatCompletedAt(value) {
  if (!value) return { date: "—", time: "" };
  const d = new Date(value);
  return {
    date: d.toLocaleDateString(undefined, {
      dateStyle: "medium",
      timeZone: "Asia/Qatar",
    }),
    time: d.toLocaleTimeString(undefined, {
      timeStyle: "short",
      timeZone: "Asia/Qatar",
    }),
  };
}

function formatMoney(value) {
  if (value == null || value === "") return null;
  return `QAR ${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Every job's display name is its technician-entered Job ID; legacy rows that
// never captured one fall back to the tail of the Mongo id.
function jobDisplayId(row) {
  const reference = String(row?.job_reference || "").trim();
  if (reference) return reference;
  const id = String(row?._id || "");
  return id ? `#${id.slice(-6)}` : "—";
}

function technicianDisplayName(row) {
  const tech = row?.assignedTechnician;
  if (tech && typeof tech === "object") {
    const name = `${tech.firstName || ""} ${tech.lastName || ""}`.trim();
    if (name) return name;
  }
  const legacy = String(row?.legacyTechnicianName || "").trim();
  if (legacy) return legacy;
  return "";
}

// Qatar is UTC+3 with no DST — toISOString() on a local Date would report the
// previous day for anyone west of Doha, so shift explicitly before reading the
// calendar fields.
function qatarToday() {
  const now = new Date();
  const qatar = new Date(now.getTime() + (now.getTimezoneOffset() + 180) * 60000);
  const month = String(qatar.getMonth() + 1).padStart(2, "0");
  const day = String(qatar.getDate()).padStart(2, "0");
  return `${qatar.getFullYear()}-${month}-${day}`;
}

// The API names the file in Content-Disposition; cross-origin responses only
// expose that header when the server allows it, so fall back to the same shape.
function filenameFromDisposition(header) {
  if (!header) return "";
  const utf8 = /filename\*=\s*UTF-8''([^;]+)/i.exec(header);
  if (utf8 && utf8[1]) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch {
      return utf8[1].trim();
    }
  }
  const quoted = /filename\s*=\s*"([^"]+)"/i.exec(header);
  if (quoted && quoted[1]) return quoted[1];
  const bare = /filename\s*=\s*([^;]+)/i.exec(header);
  if (bare && bare[1]) return bare[1].trim();
  return "";
}

function Jobs() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") || "all";
  const token = useSelector((state) => state.auth.token);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const financeStatus =
    statusFilter === "pending" || statusFilter === "audited"
      ? statusFilter
      : undefined;

  const { data, isLoading } = useListJobsQuery({
    page: currentPage,
    limit: 10,
    search: searchTerm,
    finance_status: financeStatus,
    from: fromDate || undefined,
    to: toDate || undefined,
    payment_method: paymentMethod || undefined,
    vendor_id: vendorId || undefined,
    technician_id: technicianId || undefined,
  });

  const { data: vendorData } = useListVendorsQuery({});
  const { data: technicianData } = useListTechniciansQuery();

  const jobs = data?.jobs || [];
  const total = data?.total || 0;
  const vendors = vendorData?.vendors || [];
  const technicians = technicianData?.technicians || [];

  const filterTabs = useMemo(
    () => [
      { key: "all", label: "All completed" },
      { key: "pending", label: "Not audited" },
      { key: "audited", label: "Audited" },
    ],
    []
  );

  const setStatusFilter = (key) => {
    setCurrentPage(1);
    if (key === "all") {
      searchParams.delete("status");
    } else {
      searchParams.set("status", key);
    }
    setSearchParams(searchParams);
  };

  // Every filter change re-slices the result set, so page 2 of the old set is
  // meaningless (and often empty) against the new one.
  const onFilterChange = (setter) => (e) => {
    setter(e.target.value);
    setCurrentPage(1);
  };

  const hasBarFilters = Boolean(fromDate || toDate || paymentMethod || vendorId || technicianId);

  const clearBarFilters = () => {
    setFromDate("");
    setToDate("");
    setPaymentMethod("");
    setVendorId("");
    setTechnicianId("");
    setCurrentPage(1);
  };

  const exportQueryString = () => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (financeStatus) params.set("finance_status", financeStatus);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    if (paymentMethod) params.set("payment_method", paymentMethod);
    if (vendorId) params.set("vendor_id", vendorId);
    if (technicianId) params.set("technician_id", technicianId);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  // RTK Query cannot stream a file download, so the CSV goes out as a plain
  // fetch carrying the same bearer token the api slice attaches.
  const handleExportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError("");
    let objectUrl = "";
    try {
      const response = await fetch(
        `${API_BASE_URL}/finance/jobs/export.csv${exportQueryString()}`,
        {
          method: "GET",
          headers: token ? { authorization: `Bearer ${token}` } : {},
        }
      );
      if (!response.ok) {
        throw new Error(
          response.status === 401 || response.status === 403
            ? "Your session expired. Sign in again to export."
            : `Export failed (${response.status})`
        );
      }
      const blob = await response.blob();
      const filename =
        filenameFromDisposition(response.headers.get("content-disposition")) ||
        `finance-jobs-${qatarToday()}.csv`;
      objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Revoking synchronously can abort the download in some browsers.
      const pendingUrl = objectUrl;
      objectUrl = "";
      window.setTimeout(() => URL.revokeObjectURL(pendingUrl), 1000);
    } catch (err) {
      setExportError(err?.message || "Export failed. Please try again.");
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setExporting(false);
    }
  };

  const columns = [
    {
      title: "Job ID",
      key: "job_reference",
      width: "12%",
      render: (row) => (
        <button
          type="button"
          className="job-id-link"
          onClick={() => navigate(`/jobs/${row._id}`)}
        >
          {jobDisplayId(row)}
        </button>
      ),
    },
    {
      title: "Client",
      key: "client",
      width: "18%",
      render: (row) => (
        <div className="job-client-cell">
          <div className="job-client-name">{row.clientName || "—"}</div>
          {row.clientMobileNumber ? (
            <div className="job-client-mobile">{row.clientMobileNumber}</div>
          ) : null}
          {row.businessName ? (
            <span className="job-business-tag">{row.businessName}</span>
          ) : null}
        </div>
      ),
    },
    {
      title: "Technician",
      key: "technician",
      width: "14%",
      render: (row) => {
        const name = technicianDisplayName(row);
        if (!name) return <span className="job-no-tech">—</span>;
        return <span className="job-tech-name">{name}</span>;
      },
    },
    {
      title: "Payment",
      key: "payment_method",
      width: "10%",
      render: (row) => {
        const method = String(row.payment_method || "").toLowerCase();
        if (!method) return <span className="job-pay-empty">—</span>;
        return (
          <span className={`job-pay-pill ${method}`}>
            {PAYMENT_METHOD_LABELS[method] || method}
          </span>
        );
      },
    },
    {
      title: "Completed",
      key: "completed_at",
      width: "13%",
      render: (row) => {
        // createdAt, not updatedAt: the server filters and exports legacy rows
        // (no completed_at) on createdAt.
        const { date, time } = formatCompletedAt(row.completed_at || row.createdAt);
        return (
          <div className="job-datetime-cell">
            <div className="job-date">{date}</div>
            {time ? <div className="job-time">{time}</div> : null}
          </div>
        );
      },
    },
    {
      title: "Audit status",
      key: "finance_status",
      width: "11%",
      render: (row) => (
        <AuditStatusPill status={row.finance_status || "pending"} />
      ),
    },
    {
      title: "Net profit",
      key: "finance_net_profit",
      width: "12%",
      render: (row) => {
        const audited = row.finance_status === "audited";
        const amount = formatMoney(row.finance_net_profit);
        if (audited && amount) {
          return <span className="job-profit-value">{amount}</span>;
        }
        return <span className="job-profit-pending">Pending audit</span>;
      },
    },
    {
      title: "Actions",
      key: "actions",
      width: "10%",
      align: "center",
      render: (row) => (
        <div className="job-actions">
          <button
            type="button"
            className="job-action-btn"
            aria-label="View job"
            onClick={() => navigate(`/jobs/${row._id}`)}
          >
            <img src="/icons/eye.svg" alt="" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="jobs-container">
      <div className="jobs-header-row">
        <div className="jobs-header-copy">
          <h1 className="jobs-title">Jobs</h1>
          <p className="jobs-subtitle">
            {total.toLocaleString()} completed job{total === 1 ? "" : "s"}
            {statusFilter === "pending" ? " · not audited" : ""}
            {statusFilter === "audited" ? " · audited" : ""}
          </p>
        </div>
        <div className="jobs-filter-tabs" role="tablist" aria-label="Audit filter">
          {filterTabs.map((tab) => {
            const active =
              tab.key === statusFilter ||
              (tab.key === "all" && statusFilter === "all");
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`jobs-filter-tab${active ? " active" : ""}`}
                onClick={() => setStatusFilter(tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="jobs-filter-bar">
        <div className="jobs-filter-field">
          <label className="jobs-filter-label" htmlFor="jobs-filter-from">
            From
          </label>
          <input
            id="jobs-filter-from"
            type="date"
            className="jobs-filter-input"
            value={fromDate}
            max={toDate || undefined}
            onChange={onFilterChange(setFromDate)}
          />
        </div>

        <div className="jobs-filter-field">
          <label className="jobs-filter-label" htmlFor="jobs-filter-to">
            To
          </label>
          <input
            id="jobs-filter-to"
            type="date"
            className="jobs-filter-input"
            value={toDate}
            min={fromDate || undefined}
            onChange={onFilterChange(setToDate)}
          />
        </div>

        <div className="jobs-filter-field">
          <label className="jobs-filter-label" htmlFor="jobs-filter-payment">
            Payment method
          </label>
          <select
            id="jobs-filter-payment"
            className="jobs-filter-input"
            value={paymentMethod}
            onChange={onFilterChange(setPaymentMethod)}
          >
            <option value="">All methods</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
        </div>

        <div className="jobs-filter-field">
          <label className="jobs-filter-label" htmlFor="jobs-filter-vendor">
            Vendor
          </label>
          <select
            id="jobs-filter-vendor"
            className="jobs-filter-input"
            value={vendorId}
            onChange={onFilterChange(setVendorId)}
          >
            <option value="">All vendors</option>
            {vendors.map((vendor) => (
              <option key={vendor._id} value={vendor._id}>
                {vendor.isActive === false
                  ? `${vendor.name} (inactive)`
                  : vendor.name}
              </option>
            ))}
          </select>
        </div>

        <div className="jobs-filter-field">
          <label className="jobs-filter-label" htmlFor="jobs-filter-technician">
            Technician
          </label>
          <select
            id="jobs-filter-technician"
            className="jobs-filter-input"
            value={technicianId}
            onChange={onFilterChange(setTechnicianId)}
          >
            <option value="">All technicians</option>
            {technicians.map((tech) => {
              const name = `${tech.firstName || ""} ${tech.lastName || ""}`.trim() || "Technician";
              return (
                <option key={tech._id} value={tech._id}>
                  {name}
                </option>
              );
            })}
          </select>
        </div>

        <div className="jobs-filter-actions">
          {hasBarFilters ? (
            <button
              type="button"
              className="jobs-filter-clear"
              onClick={clearBarFilters}
            >
              Clear filters
            </button>
          ) : null}
          <button
            type="button"
            className="jobs-export-btn"
            onClick={handleExportCsv}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      {exportError ? (
        <div className="jobs-export-error" role="alert">
          {exportError}
        </div>
      ) : null}

      <DataTable
        title="Completed jobs"
        columns={columns}
        data={jobs}
        loading={isLoading}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        searchPlaceholder="Search Job ID, client, phone, location…"
        hideFilterIcon
        filterButtonText=""
        pagination={{
          current: currentPage,
          total,
          pageSize: 10,
          onChange: setCurrentPage,
        }}
      />
    </div>
  );
}

export default Jobs;
