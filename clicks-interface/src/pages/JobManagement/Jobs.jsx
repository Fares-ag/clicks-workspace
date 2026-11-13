import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useGetJobsQuery, useGetJobStatsQuery } from "../../store/jobApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useAdminRole } from "../../utils/adminRoles";
import { usePageVisible } from "../../hooks/usePageVisible";
import DataTable from "../../components/DataTable/DataTable.jsx";
import SuccessModal from "../../components/SuccessModal.jsx";
import JobFilterDropdown, { EMPTY_JOB_FILTERS } from "../../components/JobFilterDropdown.jsx";
import JobStatsStrip from "../../components/JobStatsStrip.jsx";
import EditJobModal from "../../components/EditJobModal.jsx";
import JobStatusPill from "../../components/JobStatusPill.jsx";
import { isBusinessPortalJob, isTechnicianCreatedJob, formatJobSourceLabel } from "../../utils/jobOrigin.js";
import { getJobDisplayId } from "../../utils/jobLabel.js";
import {
  formatJobLocationDisplay,
  buildJobMapsLink,
} from "../../utils/formatJobLocationDisplay.js";
import "./Jobs.css";

function PaymentStatusPill({ status }) {
  return (
    <span className={`job-payment-pill ${status}`}>
      {status === "paid" ? "Paid" : "Unpaid"}
    </span>
  );
}


function BusinessJobTag({ job }) {
  if (!isBusinessPortalJob(job)) return null;
  const label = job.businessName?.trim() || "Business";
  return (
    <span className="job-business-tag" title="Business portal job">
      {label}
    </span>
  );
}

function TechnicianJobTag({ job }) {
  if (!isTechnicianCreatedJob(job)) return null;
  const label = job.createdByTechnicianName?.trim() || "Technician";
  return (
    <span className="job-technician-tag" title="Technician-created job">
      {label}
    </span>
  );
}

function ClientInfoCell({ job }) {
  return (
    <div className="job-client-cell">
      <div className="job-client-name">
        <span>{job.clientName}</span>
        <BusinessJobTag job={job} />
        <TechnicianJobTag job={job} />
      </div>
      <div className="job-client-mobile">{job.clientMobileNumber}</div>
      {job.job_status === "on_hold" && job.hold_reason ? (
        <div className="job-hold-reason" title={job.hold_reason}>
          On hold: {job.hold_reason.length > 60 ? `${job.hold_reason.slice(0, 60)}…` : job.hold_reason}
        </div>
      ) : null}
    </div>
  );
}

function AssignedTechnicianCell({ job, navigate }) {
  const technician = job?.assignedTechnician;
  const legacyName = job?.legacyTechnicianName?.trim();

  if (technician) {
    return (
      <div
        className="job-tech-cell"
        onClick={() => navigate(`/technicians/${technician._id}`)}
      >
        <img
          src={technician.profilePicture || technician.profileImage || "/icons/user.svg"}
          alt="Technician"
          className="job-tech-img"
        />
        <span className="job-tech-name">
          {technician.firstName} {technician.lastName}
        </span>
      </div>
    );
  }

  if (legacyName) {
    return (
      <div className="job-tech-cell job-tech-cell-legacy" title="Historical import — technician not linked in system">
        <img
          src="/icons/user.svg"
          alt="Technician"
          className="job-tech-img"
        />
        <span className="job-tech-name">{legacyName}</span>
      </div>
    );
  }

  return <span className="job-no-tech">No Technician</span>;
}

function JobActions({ onView }) {
  return (
    <div className="job-actions">
      <button className="job-action-btn" type="button" onClick={onView} aria-label="View job">
        <img src="/icons/eye.svg" alt="View" />
      </button>
    </div>
  );
}

function JobCardActions({ onView, job }) {
  return (
    <div className="job-actions job-actions--card">
      <button className="job-action-btn" type="button" onClick={onView} aria-label="View job">
        <img src="/icons/eye.svg" alt="" />
        <span className="job-action-label">View</span>
      </button>
      <WhatsAppShareCell job={job} />
    </div>
  );
}

const JOB_KPI_WHEN = {
  createdToday: { path: "createdAt", label: "Created" },
  completedToday: { path: "completed_at", label: "Completed" },
  revenueToday: { path: "completed_at", label: "Completed" },
  cancelledToday: { path: "cancelled_at", label: "Cancelled" },
  assigned: { path: "assigned_at", label: "Assigned" },
  accepted: { path: "accepted_at", label: "Accepted" },
  en_route: { path: "en_route_at", label: "En route" },
  arrived: { path: "arrived_at", label: "Arrived" },
  in_progress: { path: "started_at", label: "Started" },
  on_hold: { path: "on_hold_at", label: "On hold" },
  at_garage: { path: "garage.sent_at", label: "Sent to garage" },
  returning: { path: "garage.ready_at", label: "Ready" },
  pending: { path: "dateTime", label: "Scheduled" },
  open: { path: "dateTime", label: "Scheduled" },
  unpaid: { path: "dateTime", label: "Scheduled" },
};

const JOBS_LIST_STATE_KEY = "clicks.admin.jobs.list";
const JOB_FILTER_KEYS = Object.keys(EMPTY_JOB_FILTERS);
const JOB_KPI_KEYS = new Set(Object.keys(JOB_KPI_WHEN));

function emptyJobsListState() {
  return {
    filters: { ...EMPTY_JOB_FILTERS },
    page: 1,
    kpi: null,
    search: "",
  };
}

function parseJobsListParams(searchParams) {
  const filters = { ...EMPTY_JOB_FILTERS };
  let hasAny = false;
  for (const key of JOB_FILTER_KEYS) {
    const value = searchParams.get(key);
    if (value) {
      filters[key] = value;
      hasAny = true;
    }
  }
  const pageRaw = parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 1 ? pageRaw : 1;
  if (page > 1) hasAny = true;
  const kpiRaw = searchParams.get("kpi");
  const kpi = kpiRaw && JOB_KPI_KEYS.has(kpiRaw) ? kpiRaw : null;
  if (kpi) hasAny = true;
  const search = searchParams.get("search") || "";
  if (search) hasAny = true;
  return {
    hasAny,
    state: { filters, page, kpi, search },
  };
}

function serializeJobsListParams({ filters, page, kpi, search }) {
  const params = new URLSearchParams();
  const searchTrim = String(search || "").trim();
  if (searchTrim) params.set("search", searchTrim);
  if (page > 1) params.set("page", String(page));
  if (kpi && JOB_KPI_KEYS.has(kpi)) params.set("kpi", kpi);
  for (const key of JOB_FILTER_KEYS) {
    const value = String(filters?.[key] || "").trim();
    if (value) params.set(key, value);
  }
  return params;
}

function readStoredJobsListState() {
  try {
    const raw = sessionStorage.getItem(JOBS_LIST_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const filters = { ...EMPTY_JOB_FILTERS };
    for (const key of JOB_FILTER_KEYS) {
      filters[key] = String(parsed.filters?.[key] || "");
    }
    const pageRaw = parseInt(parsed.page, 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 1 ? pageRaw : 1;
    const kpi = parsed.kpi && JOB_KPI_KEYS.has(parsed.kpi) ? parsed.kpi : null;
    const search = String(parsed.search || "");
    return { filters, page, kpi, search };
  } catch {
    return null;
  }
}

function writeStoredJobsListState(state) {
  try {
    sessionStorage.setItem(JOBS_LIST_STATE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota */
  }
}

function initialJobsListState(searchParams) {
  const fromUrl = parseJobsListParams(searchParams);
  if (fromUrl.hasAny) return fromUrl.state;
  return readStoredJobsListState() || emptyJobsListState();
}

function readJobPath(job, path) {
  return String(path || "")
    .split(".")
    .reduce((acc, key) => (acc == null ? acc : acc[key]), job);
}

function jobEventTimestamp(job, kpi) {
  const meta = JOB_KPI_WHEN[kpi];
  if (!meta) return { at: job.dateTime, label: null };
  return { at: readJobPath(job, meta.path), label: meta.label };
}

function JobWhenCell({ job, kpi }) {
  const { at, label } = jobEventTimestamp(job, kpi);
  const primary = at || job.dateTime;
  const date = primary ? new Date(primary) : null;
  const scheduled = job.dateTime ? new Date(job.dateTime) : null;
  const showScheduled =
    Boolean(label && scheduled && primary) &&
    scheduled.toDateString() !== date?.toDateString();

  return (
    <div className="job-datetime-cell">
      {label ? <div className="job-datetime-kicker">{label}</div> : null}
      <div className="job-date">{date ? date.toLocaleDateString() : "—"}</div>
      <div className="job-time">{date ? date.toLocaleTimeString() : ""}</div>
      {showScheduled ? (
        <div className="job-datetime-scheduled">
          Scheduled {scheduled.toLocaleDateString()}
        </div>
      ) : null}
    </div>
  );
}

function getJobVehicleLabel(job) {
  const v = job?.customer_vehicle_id;
  const make =
    v?.vehicle_make?.makeName ||
    job?.vehicleMake ||
    "";
  const model =
    v?.vehicle_model?.modelName ||
    job?.vehicleModel ||
    "";
  const year = v?.year || job?.vehicleYear || "";
  const parts = [make, model, year].filter((p) => String(p).trim());
  return parts.length ? parts.join(" ") : "N/A";
}

function buildWhatsAppJobMessage(job) {
  const locationLink = buildJobMapsLink(job);
  const locationText = formatJobLocationDisplay(job);
  const price = job.price != null ? `QR ${job.price}` : "N/A";
  const lines = [
    "*Clicks Job Details*",
    "",
    `*Job ID:* ${getJobDisplayId(job)}`,
    `*Customer:* ${job.clientName || "N/A"}`,
    `*Mobile:* ${job.clientMobileNumber || "N/A"}`,
    `*Location:* ${locationLink || locationText || "N/A"}`,
    `*Vehicle:* ${getJobVehicleLabel(job)}`,
    `*Issue:* ${job.issue || "N/A"}`,
    `*Job type:* ${job.jobType || "N/A"}`,
    `*Price:* ${price}`,
  ];
  return lines.join("\n");
}

function shareJobOnWhatsApp(job) {
  const text = buildWhatsAppJobMessage(job);
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function WhatsAppShareCell({ job }) {
  return (
    <button
      type="button"
      className="job-whatsapp-btn"
      title="Share job on WhatsApp"
      onClick={(e) => {
        e.stopPropagation();
        shareJobOnWhatsApp(job);
      }}
    >
      <img src="/icons/whatsapp.svg" alt="WhatsApp" />
      <span>Share</span>
    </button>
  );
}

function Jobs() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isFullAdmin } = useAdminRole();
  const pageVisible = usePageVisible();
  const [initialListState] = useState(() => initialJobsListState(searchParams));
  const [page, setPage] = useState(initialListState.page);
  const [searchInput, setSearchInput] = useState(initialListState.search);
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const filterButtonRef = useRef(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState(() => ({ ...initialListState.filters }));
  const [activeStatFilter, setActiveStatFilter] = useState(initialListState.kpi);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editJobId, setEditJobId] = useState(null);

  const statsQueryParams = useMemo(() => ({
    search: debouncedSearch,
    technician: filters.technician || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    timeFrom: filters.timeFrom || undefined,
    timeTo: filters.timeTo || undefined,
    paymentStatus: filters.paymentStatus || undefined,
    jobType: filters.jobType || undefined,
    source: filters.source || undefined,
    jobOrigin: filters.jobOrigin || undefined,
  }), [debouncedSearch, filters]);

  const {
    data: summary,
    isLoading: summaryLoading,
    isFetching: summaryFetching,
    refetch: refetchSummary,
    dataUpdatedAt,
  } = useGetJobStatsQuery(statsQueryParams, {
    refetchOnFocus: true,
    pollingInterval: pageVisible ? 30000 : 0,
  });

  const jobQueryParams = useMemo(() => {
    const params = {
      page,
      limit: 40,
      search: debouncedSearch,
      technician: filters.technician || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      timeFrom: filters.timeFrom || undefined,
      timeTo: filters.timeTo || undefined,
      paymentStatus: filters.paymentStatus || undefined,
      jobType: filters.jobType || undefined,
      source: filters.source || undefined,
      jobOrigin: filters.jobOrigin || undefined,
    };

    if (activeStatFilter) {
      params.kpi = activeStatFilter;
    } else if (filters.status) {
      params.status = filters.status;
    }

    return params;
  }, [page, debouncedSearch, filters, activeStatFilter]);

  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).filter(([, v]) => String(v || "").trim()).length;
  }, [filters]);

  const { data, isLoading, isFetching, refetch } = useGetJobsQuery(jobQueryParams);
  const jobs = data?.jobs || [];
  const total = data?.total || 0;

  // Check if success message from navigation
  useEffect(() => {
    if (location.state?.successMessage) {
      setSuccessMessage(location.state.successMessage);
      setShowSuccess(true);
      // Clear the state to prevent showing again on refresh
      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${window.location.search}`
      );
    }
  }, [location]);

  useEffect(() => {
    const next = serializeJobsListParams({
      filters,
      page,
      kpi: activeStatFilter,
      search: debouncedSearch,
    });
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
    writeStoredJobsListState({
      filters,
      page,
      kpi: activeStatFilter,
      search: debouncedSearch,
    });
  }, [filters, page, activeStatFilter, debouncedSearch, searchParams, setSearchParams]);

  const handleEdit = (job) => {
    setEditJobId(job._id);
    setEditModalOpen(true);
  };

  const handleSuccess = (message) => {
    setSuccessMessage(message);
    setShowSuccess(true);
    refetch();
  };

  const columns = useMemo(() => [
    {
      title: "Job ID",
      key: "jobId", 
      dataIndex: "jobId",
      width: "10%",
      mobile: { featured: true, order: 1 },
      render: (row) => (
        <span className="job-id-cell">
          {getJobDisplayId(row)}
        </span>
      )
    },
    {
      title: "Client Info",
      key: "clientInfo",
      dataIndex: "clientInfo",
      width: "15%",
      mobile: { order: 2 },
      render: (row) => (
        <ClientInfoCell job={row} />
      )
    },
    {
      title: (JOB_KPI_WHEN[activeStatFilter] && JOB_KPI_WHEN[activeStatFilter].label) || "Date & Time",
      key: "dateTime",
      dataIndex: "dateTime",
      width: "12%",
      render: (row) => <JobWhenCell job={row} kpi={activeStatFilter} />,
    },
    {
      title: "Job Location",
      key: "location",
      dataIndex: "location",
      width: "13%",
      mobile: { order: 4 },
      render: (row) => (
        <span className="job-location-cell">
          {formatJobLocationDisplay(row)}
        </span>
      )
    },
    {
      title: "Source",
      key: "source",
      dataIndex: "source",
      width: "14%",
      render: (row) => (
        <span className="job-source-cell" title={formatJobSourceLabel(row)}>
          {formatJobSourceLabel(row)}
        </span>
      )
    },
    {
      title: "Assigned Technician",
      key: "assignedTechnician",
      dataIndex: "assignedTechnician",
      width: "15%",
      mobile: { order: 3 },
      render: (row) => (
        <AssignedTechnicianCell
          job={row}
          navigate={navigate}
        />
      )
    },
    {
      title: "Price",
      key: "price",
      dataIndex: "price",
      width: "10%",
      render: (row) => (
        <span className="job-price-cell">
          QR {row.price || 0}
        </span>
      )
    },
    {
      title: "Job Status",
      key: "status",
      dataIndex: "status",
      width: "11%",
      mobile: { featured: true, order: 0 },
      render: (row) => (
        <JobStatusPill status={row.job_status || row.status} />
      )
    },
    {
      title: "WhatsApp",
      key: "whatsapp",
      dataIndex: "whatsapp",
      width: "88px",
      mobile: { hide: true },
      render: (row) => <WhatsAppShareCell job={row} />,
    },
    {
      title: "Action",
      key: "action",
      dataIndex: "action",
      width: "72px",
      mobile: { order: 99 },
      render: (row) => (
        <JobActions onView={() => navigate(`/jobs/${row._id}`)} />
      ),
      mobileRender: (row) => (
        <JobCardActions
          job={row}
          onView={() => navigate(`/jobs/${row._id}`)}
        />
      ),
    }
  ], [navigate, activeStatFilter]);

  const handleSearch = useCallback((value) => {
    setSearchInput(value);
    setPage(1);
  }, []);

  const handleFilterApply = (newFilters) => {
    setFilters(newFilters);
    setActiveStatFilter(null);
    setPage(1);
    setFilterOpen(false);
  };

  const handleStatFilterChange = useCallback((filter) => {
    setActiveStatFilter(filter);
    setFilters((prev) => ({ ...prev, status: "" }));
    setPage(1);
  }, []);

  const handleFilterClear = useCallback(() => {
    setFilters({ ...EMPTY_JOB_FILTERS });
    setActiveStatFilter(null);
    setPage(1);
  }, []);

  const handleStatsReset = useCallback(() => {
    handleFilterClear();
    refetchSummary();
    refetch();
  }, [handleFilterClear, refetchSummary, refetch]);

  const handleStatsRefresh = useCallback(() => {
    refetchSummary();
    refetch();
  }, [refetchSummary, refetch]);

  const statsFilterActive = Boolean(activeStatFilter) || activeFilterCount > 0;

  return (
    <div className="jobs-container">
      <div className="jobs-header-row">
        <span className="jobs-title">
          Job Management
        </span>
        <div className="jobs-header-actions">
          <button className="jobs-add-btn" onClick={() => navigate("/leads/new")}>
            + Add New Lead
          </button>
        </div>
      </div>
      <JobStatsStrip
        summary={summary}
        loading={summaryLoading && !summary}
        refreshing={summaryFetching}
        activeFilter={activeStatFilter}
        onFilterChange={handleStatFilterChange}
        showRevenue={isFullAdmin}
        updatedAt={dataUpdatedAt}
        filterActive={statsFilterActive}
        onRefresh={handleStatsRefresh}
        onReset={handleStatsReset}
      />
      <DataTable
        columns={columns}
        data={jobs}
        loading={isLoading && !data}
        fetching={isFetching && !!data}
        onSearch={handleSearch}
        searchValue={searchInput}
        onFilter={() => setFilterOpen(!filterOpen)}
        filterButtonRef={filterButtonRef}
        filterButtonText={
          activeFilterCount > 0 ? `Filter (${activeFilterCount})` : "Filter"
        }
        filterDropdown={
          <JobFilterDropdown
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            onApply={handleFilterApply}
            onClear={handleFilterClear}
            initialFilters={filters}
            anchorEl={filterButtonRef}
          />
        }
        pagination={{
          current: page,
          total: total,
          pageSize: 40,
          onChange: (newPage) => setPage(newPage)
        }}
        title="Jobs"
        hideTitle
      />

      <EditJobModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        jobId={editJobId}
        onSuccess={() => handleSuccess("Job updated successfully")}
      />
      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="Success"
        subtitle={successMessage}
      />
    </div>
  );
}

export default Jobs;
