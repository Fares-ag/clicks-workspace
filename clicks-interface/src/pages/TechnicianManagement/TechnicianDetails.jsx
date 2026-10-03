import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { 
  useGetTechnicianByIdQuery,
  useGetTechnicianStatsQuery,
  useGetRecentJobsQuery,
  useGetSettlementsQuery
} from "../../store/technicianApi";
import EditDocumentModal from "../../components/EditDocumentModal.jsx";
import SettleBalanceModal from "../../components/SettleBalanceModal.jsx";
import ApproveApplicationModal from "../../components/ApproveApplicationModal.jsx";
import { useAdminRole } from "../../utils/adminRoles";
import { getJobDisplayId } from "../../utils/jobLabel.js";
import { formatJobLocationDisplay } from "../../utils/formatJobLocationDisplay.js";
import "./TechnicianDetails.css";

function StatusPill({ status }) {
  const color = "#FFFFFF";
  const bg = status === "Online" ? "#12B76A" : "#667085";
  return (
    <span
      className="tech-details-status-pill"
      style={{ background: bg, color }}
    >
      {status}
    </span>
  );
}

function ApplicationPill({ status }) {
  let color, bg;
  if (status === "Approved") {
    color = "#fff";
    bg = "#12B76A";
  } else if (status === "Pending") {
    color = "#fff";
    bg = "#F79009";
  } else {
    color = "#fff";
    bg = "#F04438";
  }
  return (
    <span
      className="tech-details-app-status-pill"
      style={{ background: bg, color }}
    >
      {status}
    </span>
  );
}

// Cash balance half-circle progress bar matching Figma design
function CashBalanceHalfCircle({ value, max = 10000 }) {
  const percent = Math.min(100, (value / max) * 100);
  const radius = 129;
  const circumference = Math.PI * radius; // Half circle
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="tech-details-cash-progress-wrapper">
      <svg width="278" height="139" viewBox="0 0 278 139" fill="none">
        {/* Background gray arc */}
        <path
          d="M 10 139 A 129 129 0 0 1 268 139"
          stroke="#E4E7EC"
          strokeWidth="20"
          fill="none"
          strokeLinecap="round"
        />
        {/* Progress red arc */}
        <path
          d="M 10 139 A 129 129 0 0 1 268 139"
          stroke="#EA4949"
          strokeWidth="20"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="tech-details-cash-progress-text">
        <div className="tech-details-cash-balance-label">Current Balance</div>
        <div className="tech-details-cash-balance-amount">
          QR {value ? value.toLocaleString() : "0"}
        </div>
      </div>
    </div>
  );
}

function JobStatusPill({ status }) {
  let className = "tech-details-job-status-pill ";
  if (status === "Ongoing") className += "tech-details-job-status-ongoing";
  else if (status === "Pending") className += "tech-details-job-status-pending";
  else className += "tech-details-job-status-completed";
  return <span className={className}>{status}</span>;
}

function ProfitPill({ profit }) {
  // Extract numeric value from "QR 200" format
  const numericProfit = typeof profit === 'string' 
    ? parseFloat(profit.replace('QR ', '').replace(/,/g, ''))
    : profit;
  
  let className = "tech-details-profit-pill ";
  if (numericProfit < 0) className += "tech-details-profit-loss";
  else className += "tech-details-profit-profit";
  
  return <span className={className}>{profit}</span>;
}

export default function TechnicianDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isFullAdmin } = useAdminRole();
  const [editDocModalOpen, setEditDocModalOpen] = useState(false);
  const [documentType, setDocumentType] = useState(null);
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);

  const { data, isLoading, error, refetch } = useGetTechnicianByIdQuery(id);
  const { data: statsData, refetch: refetchStats } = useGetTechnicianStatsQuery(id);
  const { data: jobsData, refetch: refetchJobs } = useGetRecentJobsQuery({ id, limit: 10 });
  const { data: settlementsData, refetch: refetchSettlements } = useGetSettlementsQuery(
    { id, limit: 10 },
    { skip: !isFullAdmin }
  );

  if (isLoading) {
    return (
      <div className="tech-details-wrapper">
        <div className="tech-details-loading">Loading technician details...</div>
      </div>
    );
  }
  if (error || !data?.technician) {
    return (
      <div className="tech-details-wrapper">
        <div className="tech-details-error">Error loading technician details.</div>
      </div>
    );
  }
  const technician = data.technician;
  const stats = statsData?.stats || {};
  const recentJobs = jobsData?.jobs || [];
  const settlements = settlementsData?.settlements || [];

  // Job cards with real data
  const jobCards = [
    {
      icon: "/icons/job.svg",
      title: "Total Completed Jobs",
      number: stats.totalCompletedJobs || 0
    },
    {
      icon: "/icons/car.png",
      title: "Ongoing Jobs",
      number: stats.ongoingJobs || 0
    },
    {
      icon: "/icons/vehicle.svg",
      title: "Assigned Vehicles",
      number: stats.assignedVehicles || 0
    },
    {
      icon: "/icons/performance.svg",
      title: "Total Cost",
      number: stats.totalCost || "QR 0"
    },
    {
      icon: "/icons/insurance.svg",
      title: "Total Price",
      number: stats.totalPrice || "QR 0"
    },
    {
      icon: "/icons/performance.svg",
      title: "Total Profit",
      number: stats.totalProfit || "QR 0"
    }
  ];

  const handleUpdateDocument = (type) => {
    setDocumentType(type);
    setEditDocModalOpen(true);
  };

  const handleDocumentSuccess = () => {
    refetch();
    setEditDocModalOpen(false);
  };

  const handleSettleSuccess = () => {
    refetchStats();
    refetchSettlements();
    setSettleModalOpen(false);
  };

  const handleApproveSuccess = () => {
    refetch();
    setApproveModalOpen(false);
  };

  return (
    <div className="tech-details-wrapper">
      {/* Page Header */}
      <div className="tech-details-header-row">
        <button 
          className="tech-details-back-btn"
          onClick={() => navigate('/technicians')}
        >
          <img src="/icons/long-arrow-left.svg" alt="Back" />
        </button>
        <h1 className="tech-details-page-title">Technician Management</h1>
      </div>

      <div className="tech-details-container">
        {/* Header with Title and Status */}
        <div className="tech-details-header">
          <h2 className="tech-details-title">Technician Details</h2>
          <div className="tech-details-header-actions">
            <button
              type="button"
              className="tech-details-logs-btn"
              onClick={() => navigate(`/technician-logs?technician=${id}`)}
            >
              View activity log
            </button>
            <StatusPill status={technician.currentStatus} />
          </div>
        </div>

        {/* Section 1 */}
        <div className="tech-details-section">
        {/* Left: Image + Name + Email/Phone */}
        <div className="tech-details-profile">
          <img
            src={technician.profilePicture || "/icons/user.svg"}
            alt="Technician"
            className="tech-details-profile-img"
          />
          <div className="tech-details-profile-info">
            <div className="tech-details-profile-name">{technician.firstName + " " + technician.lastName}</div>
            <div className="tech-details-profile-contact">
              <span className="tech-details-profile-email">{technician.email}</span>
              <div className="tech-details-profile-divider"></div>
              <span className="tech-details-profile-phone">{technician.phone}</span>
            </div>
            {technician.expertise && technician.expertise.length > 0 && (
              <div className="tech-details-profile-expertise">
                {technician.expertise.map((exp, index) => (
                  <React.Fragment key={exp}>
                    <span className="tech-details-profile-expertise-item">{exp}</span>
                    {index < technician.expertise.length - 1 && (
                      <div className="tech-details-profile-divider"></div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Right: Application Status */}
        <div className="tech-details-app-status">
          <div className="tech-details-app-status-label">Application Status</div>
          <div>
            <ApplicationPill status={technician.applicationStatus} />
          </div>
        </div>
        </div>

        {technician.homeHeroUrl ? (
          <div className="tech-details-section tech-details-home-hero-section">
            <div className="tech-details-home-hero-label">Home hero (technician app)</div>
            <img
              src={technician.homeHeroUrl}
              alt="Home hero"
              className="tech-details-home-hero-img"
            />
          </div>
        ) : null}

      {/* Section 2: Documents + Cash Balance in one container */}
      <div className="tech-details-docs-cash-section">
        {/* Documents (left) */}
        <div className="tech-details-docs">
          <div className="tech-details-docs-title">Documents</div>
          {/* Work Permit */}
          <div className="tech-details-docs-row">
            <div style={{ flex: 1 }}>
              <div className="tech-details-docs-label">Work Permit Front</div>
              <div className="tech-details-docs-input-wrapper">
                <input 
                  className="tech-details-docs-input" 
                  disabled 
                  value={technician.workPermitFront ? "Document uploaded" : "No document"} 
                />
                {technician.workPermitFront && (
                  <a 
                    href={technician.workPermitFront} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="tech-details-docs-view-link"
                  >
                    View
                  </a>
                )}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="tech-details-docs-label">Work Permit Back</div>
              <div className="tech-details-docs-input-wrapper">
                <input 
                  className="tech-details-docs-input" 
                  disabled 
                  value={technician.workPermitBack ? "Document uploaded" : "No document"} 
                />
                {technician.workPermitBack && (
                  <a 
                    href={technician.workPermitBack} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="tech-details-docs-view-link"
                  >
                    View
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="tech-details-docs-valid-row">
            <div className="tech-details-docs-valid-label">
              Valid Until: {technician.workPermitExpiration ? (
                (() => {
                  const exp = new Date(technician.workPermitExpiration);
                  const today = new Date();
                  // normalize times for comparison
                  today.setHours(0,0,0,0);
                  exp.setHours(0,0,0,0);
                  const isValid = exp >= today;
                  return (
                    <span className={`tech-details-valid-date ${isValid ? 'valid' : 'expired'}`}>
                      {exp.toLocaleDateString()}
                    </span>
                  );
                })()
              ) : 'N/A'}
            </div>
            <button 
              onClick={() => handleUpdateDocument('workPermit')} 
              className="tech-details-docs-update-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Update Document
            </button>
          </div>
          {/* Drivers License */}
          <div className="tech-details-docs-row">
            <div style={{ flex: 1 }}>
              <div className="tech-details-docs-label">Drivers License Front</div>
              <div className="tech-details-docs-input-wrapper">
                <input 
                  className="tech-details-docs-input" 
                  disabled 
                  value={technician.drivingLicenseFront ? "Document uploaded" : "No document"} 
                />
                {technician.drivingLicenseFront && (
                  <a 
                    href={technician.drivingLicenseFront} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="tech-details-docs-view-link"
                  >
                    View
                  </a>
                )}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="tech-details-docs-label">Drivers License Back</div>
              <div className="tech-details-docs-input-wrapper">
                <input 
                  className="tech-details-docs-input" 
                  disabled 
                  value={technician.drivingLicenseBack ? "Document uploaded" : "No document"} 
                />
                {technician.drivingLicenseBack && (
                  <a 
                    href={technician.drivingLicenseBack} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="tech-details-docs-view-link"
                  >
                    View
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="tech-details-docs-valid-row">
            <div className="tech-details-docs-valid-label">
              Valid Until: {technician.drivingLicenseExpiration ? (
                (() => {
                  const exp = new Date(technician.drivingLicenseExpiration);
                  const today = new Date();
                  today.setHours(0,0,0,0);
                  exp.setHours(0,0,0,0);
                  const isValid = exp >= today;
                  return (
                    <span className={`tech-details-valid-date ${isValid ? 'valid' : 'expired'}`}>
                      {exp.toLocaleDateString()}
                    </span>
                  );
                })()
              ) : 'N/A'}
            </div>
            <button 
              onClick={() => handleUpdateDocument('drivingLicense')} 
              className="tech-details-docs-update-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Update Document
            </button>
          </div>
          <button 
            className="tech-details-docs-approve-btn"
            onClick={() => setApproveModalOpen(true)}
            type="button"
          >
            Approve Application
          </button>
        </div>
        {/* Cash Balance (right) */}
        <div className="tech-details-cash-outer">
          <div className="tech-details-cash">
            <div className="tech-details-cash-title">Cash Balance</div>
            <CashBalanceHalfCircle value={stats.cashBalance || 0} max={10000} />
            {isFullAdmin && (
              <>
                <div className="tech-details-cash-divider" />
                <button 
                  className="tech-details-cash-settle-btn"
                  onClick={() => setSettleModalOpen(true)}
                >
                  Settle Cash Balance
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Section 3: Total Number of Jobs */}
      <div className="tech-details-section-main">
        <div className="tech-details-section-title">Total Number of Jobs</div>
        <div className="tech-details-job-cards-row">
          {jobCards.slice(0, 3).map((card, idx) => (
            <div className="tech-details-job-card" key={idx}>
              <div className="tech-details-job-card-header">
                <img src={card.icon} alt="icon" className="tech-details-job-card-icon" />
                <span className="tech-details-job-card-title">{card.title}</span>
              </div>
              <div className="tech-details-job-card-number">{card.number}</div>
            </div>
          ))}
        </div>
        <div className="tech-details-job-cards-row">
          {jobCards.slice(3, 6).map((card, idx) => (
            <div className="tech-details-job-card" key={idx}>
              <div className="tech-details-job-card-header">
                <img src={card.icon} alt="icon" className="tech-details-job-card-icon" />
                <span className="tech-details-job-card-title">{card.title}</span>
              </div>
              <div className="tech-details-job-card-number">{card.number}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Recent Jobs */}
      <div className="tech-details-section-main">
        <div className="tech-details-section-title">Recent Jobs</div>
        <table className="tech-details-table">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Date & Time</th>
              <th>Job Status</th>
              <th>Job Location</th>
              <th>Price</th>
              <th>Cost</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {recentJobs.length > 0 ? (
              recentJobs.map((job, idx) => (
                <tr key={idx}>
                  <td>{getJobDisplayId(job)}</td>
                  <td>{new Date(job.date).toLocaleString()}</td>
                  <td><JobStatusPill status={job.status} /></td>
                  <td>{formatJobLocationDisplay(job)}</td>
                  <td>{job.price}</td>
                  <td>{job.cost}</td>
                  <td><ProfitPill profit={job.profit} /></td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>
                  No recent jobs found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isFullAdmin && (
      <div className="tech-details-section-main">
        <div className="tech-details-section-title">Balance Settlement</div>
        <table className="tech-details-settlement-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Settled Amount</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {settlements.length > 0 ? (
              settlements.map((row, idx) => (
                <tr key={idx}>
                  <td>{new Date(row.date).toLocaleString()}</td>
                  <td>{row.amount}</td>
                  <td>
                    {row.receiptUrl ? (
                      <a 
                        href={row.receiptUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
                      >
                        View Receipt
                      </a>
                    ) : (
                      <span style={{ color: '#9CA3AF' }}>No receipt</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="3" style={{ textAlign: 'center', padding: '20px' }}>
                  No settlements found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
      </div>

      {/* Modals */}
      <EditDocumentModal
        open={editDocModalOpen}
        onClose={() => setEditDocModalOpen(false)}
        technicianId={id}
        documentType={documentType}
        onSuccess={handleDocumentSuccess}
      />

      {isFullAdmin && (
      <SettleBalanceModal
        open={settleModalOpen}
        onClose={() => setSettleModalOpen(false)}
        technicianId={id}
        currentBalance={stats.cashBalance || 0}
        onSuccess={handleSettleSuccess}
      />
      )}

      <ApproveApplicationModal
        open={approveModalOpen}
        onClose={() => setApproveModalOpen(false)}
        technician={technician}
        onSuccess={handleApproveSuccess}
      />
    </div>
  );
}
