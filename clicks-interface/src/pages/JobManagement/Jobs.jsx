import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useGetJobsQuery } from "../../store/jobApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import DataTable from "../../components/DataTable/DataTable.jsx";
import SuccessModal from "../../components/SuccessModal.jsx";
import JobFilterDropdown from "../../components/JobFilterDropdown.jsx";
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
      <button className="job-action-btn" onClick={onView}>
        <img src="/icons/eye.svg" alt="View" />
      </button>
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
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get("search") || "";
  });
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const filterButtonRef = useRef(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "" });
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editJobId, setEditJobId] = useState(null);

  const { data, isLoading, isFetching, refetch } = useGetJobsQuery({
    page,
    limit: 40,
    search: debouncedSearch,
    status: filters.status || undefined,
    technician: filters.technician || undefined,
  });
  const jobs = data?.jobs || [];
  const total = data?.total || 0;

  // Check if success message from navigation
  useEffect(() => {
    if (location.state?.successMessage) {
      setSuccessMessage(location.state.successMessage);
      setShowSuccess(true);
      // Clear the state to prevent showing again on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("search");
    if (q != null) {
      setSearchInput(q);
      setPage(1);
    }
  }, [location.search]);

  const handleEdit = (job) => {
    setEditJobId(job._id);
    setEditModalOpen(true);
  };

  const handleSuccess = (message) => {
    setSuccessMessage(message);
    setShowSuccess(true);
    refetch();
  };

  const columns = [
    {
      title: "Job ID",
      key: "jobId", 
      dataIndex: "jobId",
      width: "10%",
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
      render: (row) => (
        <ClientInfoCell job={row} />
      )
    },
    {
      title: "Date & Time",
      key: "dateTime",
      dataIndex: "dateTime",
      width: "12%",
      render: (row) => (
        <div className="job-datetime-cell">
          <div className="job-date">{new Date(row.dateTime).toLocaleDateString()}</div>
          <div className="job-time">{new Date(row.dateTime).toLocaleTimeString()}</div>
        </div>
      )
    },
    {
      title: "Job Location",
      key: "location",
      dataIndex: "location",
      width: "13%",
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
      render: (row) => (
        <JobStatusPill status={row.job_status || row.status} />
      )
    },
    {
      title: "WhatsApp",
      key: "whatsapp",
      dataIndex: "whatsapp",
      width: "10%",
      render: (row) => <WhatsAppShareCell job={row} />,
    },
    {
      title: "Action",
      key: "action",
      dataIndex: "action",
      width: "8%",
      render: (row) => (
        <JobActions
          onView={() => navigate(`/jobs/${row._id}`)}
        />
      )
    }
  ];

  const handleFilterApply = (newFilters) => {
    setFilters(newFilters);
    setFilterOpen(false);
  };

  const handleSearch = (value) => {
    setSearchInput(value);
    setPage(1);
  };

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
      <DataTable
        columns={columns}
        data={jobs}
        loading={isLoading && !data}
        fetching={isFetching && !!data}
        onSearch={handleSearch}
        onFilter={() => setFilterOpen(!filterOpen)}
        filterButtonRef={filterButtonRef}
        filterDropdown={
          <JobFilterDropdown
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            onApply={handleFilterApply}
            anchorEl={filterButtonRef.current}
          />
        }
        pagination={{
          current: page,
          total: total,
          pageSize: 40,
          onChange: (newPage) => setPage(newPage)
        }}
        title="Jobs"
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
