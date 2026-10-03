import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useGetJobByIdQuery, useGetJobRepairsQuery, useUpdateJobMutation, useLazyGetJobReceiptQuery, useHoldJobMutation, useResumeJobMutation, useCompleteJobMutation, useApproveHoldRequestMutation, useRejectHoldRequestMutation } from "../../store/jobApi";
import { useGetAssignmentRosterQuery } from "../../store/technicianApi";
import SuccessModal from "../../components/SuccessModal";
import "../../components/ConfirmationModal.css";
import { useAdminSocket } from "../../context/AdminSocketContext.jsx";
import "./JobDetails.css";
import { jobTypeLabel, matchesJobTypeExpertise } from "../../constants/jobTypes";
import { isSourceLockedJob, formatJobSourceLabel } from "../../utils/jobOrigin.js";
import { getJobStatusCssClass, getJobStatusLabel } from "../../utils/jobStatusLabels";

const HOLDABLE_STATUSES = ["accepted", "en_route", "arrived", "in_progress"];
const COMPLETABLE_STATUSES = ["pending", "assigned", "accepted", "en_route", "arrived", "in_progress", "on_hold"];
import { getJobDisplayId } from "../../utils/jobLabel.js";
import {
  formatJobLocationDisplay,
  buildJobMapsLink,
} from "../../utils/formatJobLocationDisplay.js";

function getJobVehicleInfo(job) {
  if (!job) return null;
  const cv = job.customer_vehicle_id;
  if (cv && typeof cv === "object") {
    return {
      make: cv.vehicle_make?.makeName || job.vehicleMake || "",
      model: cv.vehicle_model?.modelName || job.vehicleModel || "",
      year: cv.year ?? job.vehicleYear ?? null,
      licensePlate: cv.plate_number || job.licensePlate || "",
    };
  }
  return {
    make: job.vehicleMake || "",
    model: job.vehicleModel || "",
    year: job.vehicleYear ?? null,
    licensePlate: job.licensePlate || "",
  };
}

function JobDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket } = useAdminSocket() || {};
  const { data, isLoading, error, refetch } = useGetJobByIdQuery(id);
  const { data: repairsData } = useGetJobRepairsQuery(id);
  const { data: techniciansData, refetch: refetchTechnicians } = useGetAssignmentRosterQuery();
  const [updateJob] = useUpdateJobMutation();
  const [holdJob] = useHoldJobMutation();
  const [resumeJob] = useResumeJobMutation();
  const [completeJob] = useCompleteJobMutation();
  const [approveHoldRequest] = useApproveHoldRequestMutation();
  const [rejectHoldRequest] = useRejectHoldRequestMutation();
  const [getJobReceipt] = useLazyGetJobReceiptQuery();
  
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReasonText, setCancelReasonText] = useState('');
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [showRejectHoldModal, setShowRejectHoldModal] = useState(false);
  const [rejectHoldNote, setRejectHoldNote] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [holdReturnDate, setHoldReturnDate] = useState('');
  const [holding, setHolding] = useState(false);
  const [approvingHoldRequest, setApprovingHoldRequest] = useState(false);
  const [rejectingHoldRequest, setRejectingHoldRequest] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeNotes, setCompleteNotes] = useState('');
  const [completeJobRef, setCompleteJobRef] = useState('');
  const [completing, setCompleting] = useState(false);
  const [selectedTechnician, setSelectedTechnician] = useState(null);
  const [showTechDropdown, setShowTechDropdown] = useState(false);
  const [techSearch, setTechSearch] = useState("");
  const [editingEstimate, setEditingEstimate] = useState(false);
  const [estimateValue, setEstimateValue] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState({ title: "", subtitle: "" });
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationValue, setLocationValue] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const techDropdownRef = useRef(null);

  const job = data?.job;
  const repairsFromDetail = data?.repairs;
  const repairsFromQuery = repairsData?.repairs;
  const repairs =
    (repairsFromQuery?.length ? repairsFromQuery : repairsFromDetail) || [];
  const technicians = techniciansData?.technicians || [];
  const vehicleInfo = getJobVehicleInfo(job);
  const jobDuration = data?.jobDuration || null;
  const estimateTimes = data?.estimateTimes || { adminEstimateTime: null, technicianEstimateTime: null };

  const computedFinancials = React.useMemo(() => {
    if (!job) return null;
    const base = Number(job.price) || 0;
    const distanceFee = job.distance_km ? job.distance_km * 2 : 0;
    const timeFee =
      job.dateTime && new Date(job.dateTime).getUTCHours() >= 20 ? 20 : 0;
    const repairsTotal = repairs.reduce(
      (s, r) => s + (Number(r.price) || 0) * (Number(r.quantity) || 1),
      0
    );
    const totalCost = repairs.reduce(
      (s, r) => s + (Number(r.cost) || 0) * (Number(r.quantity) || 1),
      0
    );
    const currentEstimate = base + distanceFee + timeFee + repairsTotal;
    return {
      currentEstimate,
      totalCost,
      serviceCharge: distanceFee + timeFee,
      currentProfit: currentEstimate - totalCost,
      isPaid: job.payment_status === "paid",
    };
  }, [job, repairs]);

  const financials = data?.financials || computedFinancials || {
    currentEstimate: 0,
    totalCost: 0,
    serviceCharge: 0,
    currentProfit: 0,
    isPaid: false,
    finalAmount: null,
  };

  // Listen on the shared admin socket for cancel confirmations.
  useEffect(() => {
    if (!socket || !id) return undefined;

    const onJobCancelled = (data) => {
      if (data.job_id === id) {
        refetch();
      }
    };

    const onError = (data) => {
      alert(data.message || "An error occurred");
      setCancelling(false);
    };

    socket.on("jobCancelled", onJobCancelled);
    socket.on("error", onError);

    return () => {
      socket.off("jobCancelled", onJobCancelled);
      socket.off("error", onError);
    };
  }, [id, refetch, socket]);

  // Initialize selected technician from job data
  useEffect(() => {
    if (job?.assignedTechnician) {
      setSelectedTechnician(job.assignedTechnician);
    } else {
      setSelectedTechnician(null);
    }
    if (job?.estimate) {
      setEstimateValue(job.estimate);
    }
  }, [job]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (techDropdownRef.current && !techDropdownRef.current.contains(event.target)) {
        setShowTechDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter technicians by search, expertise matching job type, online/on_job status
  const filteredTechnicians = technicians.filter(tech => {
    const fullName = `${tech.firstName} ${tech.lastName}`.toLowerCase();
    const matchesSearch = fullName.includes(techSearch.toLowerCase());
    const isApproved = tech.applicationStatus === 'Approved';
    const isAvailable = tech.currentStatus === 'Online' || tech.currentStatus === 'On Job';
    
    // Map job type to required expertise
    const techExpertise = tech.expertise || [];
    const matchesExpertise = job?.jobType
      ? matchesJobTypeExpertise(job.jobType, techExpertise)
      : true;
    
    return matchesSearch && isApproved && isAvailable && matchesExpertise;
  });

  // Handle technician selection
  const handleTechnicianSelect = (tech) => {
    setSelectedTechnician(tech);
    setShowTechDropdown(false);
    setTechSearch("");
  };

  const handleSave = async () => {
    try {
  const result = await updateJob({
        id: job._id,
        assignedTechnician: selectedTechnician?._id || null
      }).unwrap();
      
      if (result?.signatureCleared) {
        setSuccessMessage({
          title: "Signature cleared",
          subtitle: "Customer details changed — the technician must re-collect the signature before complete."
        });
      } else {
        setSuccessMessage({
          title: "Job Updated Successfully",
          subtitle: "The technician has been assigned to this job."
        });
      }
      setShowSuccessModal(true);
      refetch();
    } catch (err) {
      console.error('Failed to update job:', err);
      alert(err?.data?.message || 'Failed to update job');
    }
  };

  // Handle update estimate
  const handleUpdateEstimate = async () => {
    try {
      const newEstimate = parseFloat(estimateValue);
      if (isNaN(newEstimate) || newEstimate < 0) {
        alert('Please enter a valid estimate amount');
        return;
      }
      
      await updateJob({
        id: job._id,
        estimate: newEstimate
      }).unwrap();
      
      setEditingEstimate(false);
      alert('Estimate updated successfully');
      refetch();
    } catch (err) {
      console.error('Failed to update estimate:', err);
      alert('Failed to update estimate');
    }
  };

  // Inline job-location edit (PUT /jobs/:id with { location } only).
  // The API re-geocodes, updates locationCoordinates and clears any customer
  // signature; completed jobs are rejected server-side (400).
  const startEditLocation = () => {
    setLocationValue(String(job?.location || ""));
    setLocationError("");
    setEditingLocation(true);
  };

  const cancelEditLocation = () => {
    setEditingLocation(false);
    setLocationError("");
  };

  const handleSaveLocation = async () => {
    const next = locationValue.trim();
    if (!next) {
      setLocationError("Enter an address, lat,lng, or a Google Maps / Waze link");
      return;
    }
    setSavingLocation(true);
    setLocationError("");
    try {
      const result = await updateJob({ id: job._id, location: next }).unwrap();
      setEditingLocation(false);
      setSuccessMessage(
        result?.signatureCleared
          ? {
              title: "Location updated — signature cleared",
              subtitle: "The technician must re-collect the customer signature before completing.",
            }
          : {
              title: "Location updated",
              subtitle: "The maps link now points to the new location.",
            }
      );
      setShowSuccessModal(true);
      refetch();
    } catch (err) {
      console.error("Failed to update location:", err);
      setLocationError(
        err?.data?.message || err?.data?.error || "Failed to update location"
      );
    } finally {
      setSavingLocation(false);
    }
  };

  // Use financials from API response
  const dispatcherEstimate = financials.dispatcherEstimate || 0;
  const technicianEstimate = financials.technicianEstimate || 0;
  const finalPrice = financials.finalPrice || 0;
  const currentEstimate = financials.currentEstimate || 0;
  const totalCost = financials.totalCost || 0;
  const serviceCharge = financials.serviceCharge || 0;
  const currentProfit = financials.currentProfit !== undefined ? financials.currentProfit : 0;
  const isPaid = financials.isPaid || false;

  // Handle cancel job - show confirmation modal
  const handleCancelJob = () => {
    if (!socket || !job) return;
    setShowCancelModal(true);
  };

  // Confirm cancel job
  const confirmCancelJob = () => {
    const reason = cancelReason === 'Other' 
      ? (cancelReasonText.trim() || 'Cancelled by admin') 
      : (cancelReason || 'Cancelled by admin');
    
    setCancelling(true);
    setShowCancelModal(false);
    
    socket.emit('adminCancelJob', {
      job_id: job._id,
      customer_id: job.customer_id?._id || job.customer_id,
      technician_id: job.assignedTechnician?._id || job.assignedTechnician,
      reason
    });

    setCancelReason('');
    setCancelReasonText('');
  };

  const handleHoldJob = () => {
    setHoldReason('');
    setHoldReturnDate('');
    setShowHoldModal(true);
  };

  const confirmHoldJob = async () => {
    const reason = holdReason.trim();
    if (!reason || !job) return;
    setHolding(true);
    try {
      await holdJob({
        id: job._id,
        reason,
        scheduled_return_at: holdReturnDate || undefined,
      }).unwrap();
      setShowHoldModal(false);
      setHoldReason('');
      setHoldReturnDate('');
      refetch();
    } catch (err) {
      alert(err?.data?.message || err?.data?.error || err?.message || 'Failed to put job on hold');
    } finally {
      setHolding(false);
    }
  };

  const handleResumeJob = async () => {
    if (!job) return;
    setResuming(true);
    try {
      await resumeJob(job._id).unwrap();
      refetch();
    } catch (err) {
      alert(err?.data?.message || err?.data?.error || err?.message || 'Failed to resume job');
    } finally {
      setResuming(false);
    }
  };

  const confirmCompleteJob = async () => {
    if (!job) return;
    setCompleting(true);
    try {
      await completeJob({
        id: job._id,
        completion_notes: completeNotes.trim() || undefined,
        job_reference: completeJobRef.trim() || undefined,
      }).unwrap();
      setShowCompleteModal(false);
      setCompleteNotes('');
      setCompleteJobRef('');
      setSuccessMessage({
        title: 'Job marked as completed',
        subtitle: 'The job status is now Completed.',
      });
      setShowSuccessModal(true);
      refetch();
    } catch (err) {
      alert(err?.data?.message || err?.data?.error || err?.message || 'Failed to complete job');
    } finally {
      setCompleting(false);
    }
  };

  const handleApproveHoldRequest = async () => {
    if (!job) return;
    setApprovingHoldRequest(true);
    try {
      await approveHoldRequest({ id: job._id }).unwrap();
      refetch();
    } catch (err) {
      alert(err?.data?.message || err?.data?.error || err?.message || 'Failed to approve hold request');
    } finally {
      setApprovingHoldRequest(false);
    }
  };

  const confirmRejectHoldRequest = async () => {
    if (!job) return;
    setRejectingHoldRequest(true);
    try {
      await rejectHoldRequest({
        id: job._id,
        note: rejectHoldNote.trim() || undefined,
      }).unwrap();
      setShowRejectHoldModal(false);
      setRejectHoldNote('');
      refetch();
    } catch (err) {
      alert(err?.data?.message || err?.data?.error || err?.message || 'Failed to reject hold request');
    } finally {
      setRejectingHoldRequest(false);
    }
  };

  // Handle download receipt
  const handleDownloadReceipt = async () => {
    if (!job || job.job_status !== 'completed') {
      alert('Receipt can only be downloaded for completed jobs');
      return;
    }
    
    try {
      // Use RTK Query lazy hook - this automatically includes auth token from Redux state
      const result = await getJobReceipt(id);
      
      if (result.error) {
        throw new Error(result.error.data?.error || result.error.data?.message || 'Failed to get receipt');
      }
      
      const data = result.data;
      
      // Open the PDF URL in a new tab (it already has SAS token)
      if (data?.pdf_url) {
        window.open(data.pdf_url, '_blank');
      } else {
        throw new Error('Receipt PDF URL not found in response');
      }
    } catch (error) {
      console.error('Error downloading receipt:', error);
      alert(`Failed to download receipt: ${error.message}`);
    }
  };

  if (isLoading) {
    return <div className="job-details-loading">Loading...</div>;
  }

  if (error || !job) {
    return <div className="job-details-error">Job not found</div>;
  }

  // Format date and time
  const jobDate = new Date(job.dateTime);
  const formattedDate = jobDate.toLocaleDateString('en-US', { 
    month: 'numeric', 
    day: 'numeric', 
    year: 'numeric' 
  });
  const formattedTime = jobDate.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });

  const statusCssClass = getJobStatusCssClass(job.job_status);
  const statusLabel = getJobStatusLabel(job.job_status);
  const leadRef = job.lead_id;
  const leadId =
    leadRef && typeof leadRef === "object"
      ? leadRef._id
      : leadRef || null;
  const leadInternalNotes =
    leadRef && typeof leadRef === "object"
      ? String(leadRef.internalNotes || "").trim()
      : "";

  return (
    <div className="job-details-container">
      <h1 className="job-details-page-header">Job Management</h1>
      
      <div className="job-details-card">
        <div className="job-details-header">
          <h2 className="job-details-title">Job Details</h2>
          <span className="job-details-header-jobid" title="Job ID">
            {getJobDisplayId(job)}
          </span>
        </div>

        <div className="job-details-content">
          {/* Job Information Section */}
          <div className="job-details-section">
            <div className="job-details-section-left">
              <h3 className="job-details-section-title">Job Information</h3>
              
              <div className="job-details-info-grid">
                <div className="job-details-info-column">
                  <div className="job-details-info-group">
                    <span className="job-details-label">Job ID</span>
                    <span className="job-details-value">{getJobDisplayId(job)}</span>
                  </div>
                  
                  <div className="job-details-info-group">
                    <span className="job-details-label">Job Location</span>
                    <div className="job-details-location">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 9.75C10.2426 9.75 11.25 8.74264 11.25 7.5C11.25 6.25736 10.2426 5.25 9 5.25C7.75736 5.25 6.75 6.25736 6.75 7.5C6.75 8.74264 7.75736 9.75 9 9.75Z" stroke="#5A5A5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M9 16.5C9 16.5 15 11.625 15 7.5C15 4.18629 12.3137 1.5 9 1.5C5.68629 1.5 3 4.18629 3 7.5C3 11.625 9 16.5 9 16.5Z" stroke="#5A5A5A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <a
                        href={buildJobMapsLink(job)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="job-details-location-link"
                      >
                        {formatJobLocationDisplay(job)}
                      </a>
                    </div>
                    {job.job_status === "completed" ? (
                      <span className="job-details-location-helper">
                        Location cannot be changed after completion
                      </span>
                    ) : editingLocation ? (
                      <div className="job-details-location-edit">
                        <input
                          type="text"
                          className="job-details-input job-details-location-input"
                          value={locationValue}
                          onChange={(e) => setLocationValue(e.target.value)}
                          placeholder="Address, lat/lng, or Google Maps / Waze link"
                          disabled={savingLocation}
                          autoFocus
                        />
                        <div className="job-details-location-edit-actions">
                          <button
                            type="button"
                            className="job-details-btn job-details-btn-primary"
                            onClick={handleSaveLocation}
                            disabled={savingLocation}
                          >
                            {savingLocation ? "Saving…" : "Save location"}
                          </button>
                          <button
                            type="button"
                            className="job-details-btn job-details-btn-secondary"
                            onClick={cancelEditLocation}
                            disabled={savingLocation}
                          >
                            Cancel
                          </button>
                        </div>
                        {locationError && (
                          <span className="job-details-location-error">{locationError}</span>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="job-details-location-edit-link"
                        onClick={startEditLocation}
                      >
                        Edit location
                      </button>
                    )}
                  </div>
                  
                  {job.job_status === 'completed' && job.completed_at && (
                    <div className="job-details-info-group">
                      <span className="job-details-label">Completion Date</span>
                      <span className="job-details-value">
                        {new Date(job.completed_at).toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric',
                          timeZone: 'Asia/Qatar'
                        })} - {new Date(job.completed_at).toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true,
                          timeZone: 'Asia/Qatar'
                        })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="job-details-info-column">
                  <div className="job-details-info-group">
                    <span className="job-details-label">Date & Time</span>
                    <span className="job-details-value">{formattedDate} - {formattedTime}</span>
                  </div>
                  
                  <div className="job-details-info-group">
                    <span className="job-details-label">Job Status</span>
                    <span className={`job-details-status-badge ${statusCssClass}`}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="job-details-info-group">
                    <span className="job-details-label">Job type</span>
                    <span className="job-details-value">
                      {jobTypeLabel(job.jobType) || job.jobType || "—"}
                    </span>
                  </div>
                  
                  {jobDuration && job.job_status === 'completed' && (
                    <div className="job-details-info-group">
                      <span className="job-details-label">Job Duration</span>
                      <span className="job-details-value">
                        {jobDuration.formatted}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <h3 className="job-details-section-title">
                Client Details
                {(job.business_id || job.businessName || /business\s*portal/i.test(job.source?.mainSourceName || '')) && (
                  <span className="job-details-business-tag" title="Business portal job">
                    {job.businessName?.trim() || 'Business'}
                  </span>
                )}
                {(job.created_by_technician || job.createdByTechnicianName || /technician\s*app/i.test(job.source?.mainSourceName || '')) && (
                  <span className="job-details-technician-tag" title="Technician-created job">
                    {job.createdByTechnicianName?.trim() || 'Technician'}
                  </span>
                )}
              </h3>
              
              <div className="job-details-info-grid">
                <div className="job-details-info-column">
                  <div className="job-details-info-group">
                    <span className="job-details-label">Name</span>
                    <span className="job-details-value">{job.clientName}</span>
                  </div>
                  
                  <div className="job-details-info-group">
                    <span className="job-details-label">Email Address</span>
                    <span className="job-details-value">{job.customer_id?.email || 'N/A'}</span>
                  </div>
                </div>

                <div className="job-details-info-column">
                  <div className="job-details-info-group">
                    <span className="job-details-label">Contact Number</span>
                    <span className="job-details-value">{job.clientMobileNumber}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="job-details-divider"></div>

            <div className="job-details-section-right">
              <h3 className="job-details-section-title">Customer Vehicle Information</h3>
              
              <div className="job-details-vehicle-box">
                <div className="job-details-info-grid">
                  <div className="job-details-info-column">
                    <div className="job-details-info-group">
                      <span className="job-details-label">Make</span>
                      <span className="job-details-value-dark">
                        {vehicleInfo?.make || "N/A"}
                      </span>
                    </div>
                    
                    <div className="job-details-info-group">
                      <span className="job-details-label">Year</span>
                      <span className="job-details-value-dark">
                        {vehicleInfo?.year || "N/A"}
                      </span>
                    </div>
                  </div>

                  <div className="job-details-info-column">
                    <div className="job-details-info-group">
                      <span className="job-details-label">Model</span>
                      <span className="job-details-value-dark">
                        {vehicleInfo?.model || "N/A"}
                      </span>
                    </div>
                    
                    <div className="job-details-info-group">
                      <span className="job-details-label">Plate Number</span>
                      <span className="job-details-value-dark">
                        {vehicleInfo?.licensePlate || "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="job-details-info-group">
                <span className="job-details-label">Issue</span>
                <span className="job-details-value">{job.issue}</span>
              </div>

              {/* Source Info */}
              {job.source && (
                <div className="job-details-info-group">
                  <span className="job-details-label">Source</span>
                  <span className="job-details-value">
                    {formatJobSourceLabel(job)}
                    {isSourceLockedJob(job) && (
                      <>
                        {" "}
                        <span className="job-source-locked" title="Source is locked for Technician App and Business Portal jobs">
                          🔒 Locked
                        </span>
                      </>
                    )}
                  </span>
                </div>
              )}

            </div>
          </div>

          {/* Cancellation Reason Section */}
          {job.job_status === 'cancelled' && (job.cancellation_reason || (job.rejection_reasons && job.rejection_reasons.length > 0)) && (
            <div className="job-details-section-full">
              <div className="job-details-cancellation-card">
                <div className="job-details-cancellation-header">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="9" stroke="#F04438" strokeWidth="2"/>
                    <path d="M7 7L13 13M13 7L7 13" stroke="#F04438" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <h3 className="job-details-cancellation-title">Cancellation Reason</h3>
                  {job.cancelled_by && (
                    <span className="job-details-cancellation-by">by {job.cancelled_by === 'admin' ? 'Admin' : job.cancelled_by === 'technician' ? 'Technician' : 'Customer'}</span>
                  )}
                </div>
                <p className="job-details-cancellation-text">
                  {job.cancellation_reason || (job.rejection_reasons && job.rejection_reasons[job.rejection_reasons.length - 1]) || 'No reason provided'}
                </p>
                {job.rejection_description && (
                  <p className="job-details-cancellation-description">
                    {job.rejection_description}
                  </p>
                )}
                {job.cancelled_at && (
                  <span className="job-details-cancellation-date">
                    Cancelled on {new Date(job.cancelled_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: 'numeric', minute: '2-digit', hour12: true
                    })}
                  </span>
                )}
              </div>
            </div>
          )}

          {job.hold_request?.status === 'pending' && (
            <div className="job-details-section-full">
              <div className="job-details-hold-card">
                <div className="job-details-cancellation-header">
                  <h3 className="job-details-cancellation-title">Hold request pending</h3>
                </div>
                <p className="job-details-cancellation-text">
                  {job.hold_request.reason || 'No reason provided'}
                </p>
                {job.hold_request.requested_at && (
                  <span className="job-details-cancellation-date">
                    Requested {new Date(job.hold_request.requested_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: 'numeric', minute: '2-digit', hour12: true
                    })}
                  </span>
                )}
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                  <button
                    type="button"
                    className="job-details-btn job-details-btn-warning"
                    onClick={handleApproveHoldRequest}
                    disabled={approvingHoldRequest || rejectingHoldRequest}
                  >
                    {approvingHoldRequest ? 'Approving…' : 'Approve hold'}
                  </button>
                  <button
                    type="button"
                    className="job-details-btn job-details-btn-danger"
                    onClick={() => {
                      setRejectHoldNote('');
                      setShowRejectHoldModal(true);
                    }}
                    disabled={approvingHoldRequest || rejectingHoldRequest}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          )}

          {(job.job_status === 'on_hold' || job.hold_reason) && (
            <div className="job-details-section-full">
              <div className="job-details-hold-card">
                <div className="job-details-cancellation-header">
                  <h3 className="job-details-cancellation-title">
                    {job.job_status === 'on_hold' ? 'On Hold' : 'Previous hold'}
                  </h3>
                  {job.held_by && (
                    <span className="job-details-cancellation-by">
                      by {job.held_by === 'admin' ? 'Admin' : 'Technician'}
                    </span>
                  )}
                </div>
                <p className="job-details-cancellation-text">
                  {job.hold_reason || 'No reason provided'}
                </p>
                {job.status_before_hold && job.job_status === 'on_hold' && (
                  <p className="job-details-cancellation-description">
                    Will resume to {getJobStatusLabel(job.status_before_hold)}
                  </p>
                )}
                {job.scheduled_return_at && (
                  <p className="job-details-cancellation-description">
                    Scheduled return: {new Date(job.scheduled_return_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                )}
                {job.on_hold_at && (
                  <span className="job-details-cancellation-date">
                    Put on hold {new Date(job.on_hold_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: 'numeric', minute: '2-digit', hour12: true
                    })}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Customer e-signature (tech app gates complete on this) */}
          {['arrived', 'in_progress', 'completed'].includes(job.job_status) && (
            <div className="job-details-section-full">
              <h3 className="job-details-section-title">Customer signature</h3>
              {job.customerSignatureUrl ? (
                <div className="job-details-signature-card signed">
                  <img
                    src={job.customerSignatureUrl}
                    alt="Customer signature"
                    className="job-details-signature-img"
                  />
                  {job.customerSignedAt && (
                    <span className="job-details-signature-meta">
                      Signed{' '}
                      {new Date(job.customerSignedAt).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </span>
                  )}
                </div>
              ) : job.customerSignatureInvalidatedAt ? (
                <div className="job-details-signature-card cleared">
                  <p className="job-details-signature-banner">
                    Signature cleared — technician must re-collect before completing the job.
                  </p>
                  <span className="job-details-signature-meta">
                    Cleared{' '}
                    {new Date(job.customerSignatureInvalidatedAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                </div>
              ) : (
                <div className="job-details-signature-card empty">
                  <p className="job-details-signature-empty">Not signed yet</p>
                </div>
              )}
            </div>
          )}

          {/* Internal notes from the source lead */}
          {leadId ? (
            <div className="job-details-section-full">
              <div className="job-details-internal-notes-head">
                <h3 className="job-details-section-title">Internal notes</h3>
                <Link className="job-details-lead-link" to={`/leads/${leadId}`}>
                  View lead
                </Link>
              </div>
              <p className="job-details-internal-notes-hint">
                From the lead record — edit on the lead page.
              </p>
              {leadInternalNotes ? (
                <div className="job-details-admin-notes">
                  <div className="admin-note-item">
                    <p className="admin-note-text">{leadInternalNotes}</p>
                  </div>
                </div>
              ) : (
                <p className="job-details-completion-notes-empty">
                  No internal notes on this lead.
                </p>
              )}
            </div>
          ) : null}

          {/* Technician completion notes (added when marking job complete) */}
          {job.job_status === "completed" && (
            <div className="job-details-section-full">
              <h3 className="job-details-section-title">Technician completion notes</h3>
              {job.completion_notes?.trim() ? (
                <div className="job-details-admin-notes">
                  <div className="admin-note-item">
                    <div className="admin-note-header">
                      <span className="admin-note-author">
                        {selectedTechnician
                          ? `${selectedTechnician.firstName} ${selectedTechnician.lastName}`
                          : job.legacyTechnicianName?.trim() || "Technician"}
                      </span>
                      {job.completed_at && (
                        <span className="admin-note-date">
                          {new Date(job.completed_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                            timeZone: "Asia/Qatar",
                          })}
                        </span>
                      )}
                    </div>
                    <p className="admin-note-text">{job.completion_notes.trim()}</p>
                  </div>
                </div>
              ) : (
                <p className="job-details-completion-notes-empty">No notes provided</p>
              )}
            </div>
          )}

          {/* Assigned Technician Section */}
          <div className="job-details-section-full">
            <h3 className="job-details-section-title">Assigned Technician</h3>
            
            <div className="job-details-form-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <label className="job-details-form-label" style={{ margin: 0 }}>Assigned Technician</label>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    refetchTechnicians();
                  }}
                  style={{
                    background: 'none',
                    border: '1px solid #D0D5DD',
                    borderRadius: '6px',
                    padding: '2px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    color: '#344054'
                  }}
                  title="Refresh technician list"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                  Refresh
                </button>
              </div>
              <div className="job-details-select-wrapper" ref={techDropdownRef}>
                <div 
                  className={`job-details-select ${job.assignedTechnician && ['en_route', 'arrived', 'in_progress', 'completed', 'on_hold'].includes(job.job_status) ? 'job-details-select-disabled' : ''}`}
                  onClick={() => {
                    // Allow reassignment only if job hasn't started traveling and isn't on hold
                    if (!job.assignedTechnician || !['en_route', 'arrived', 'in_progress', 'completed', 'on_hold'].includes(job.job_status)) {
                      setShowTechDropdown(!showTechDropdown);
                    }
                  }}
                  style={{ 
                    cursor: (job.assignedTechnician && ['en_route', 'arrived', 'in_progress', 'completed', 'on_hold'].includes(job.job_status)) ? 'not-allowed' : 'pointer' 
                  }}
                  title={
                    (job.assignedTechnician && ['en_route', 'arrived', 'in_progress', 'completed', 'on_hold'].includes(job.job_status))
                      ? 'Cannot reassign technician after job has started or while on hold'
                      : ''
                  }
                >
                  {selectedTechnician && (
                    <>
                      <img 
                        src={selectedTechnician.profilePicture || "/icons/user.svg"} 
                        alt="Technician" 
                        className="job-details-tech-avatar"
                      />
                      <span className="job-details-select-text">
                        {selectedTechnician.firstName} {selectedTechnician.lastName}
                      </span>
                    </>
                  )}
                  {!selectedTechnician && job?.legacyTechnicianName?.trim() && (
                    <>
                      <img
                        src="/icons/user.svg"
                        alt="Technician"
                        className="job-details-tech-avatar"
                      />
                      <span className="job-details-select-text">
                        {job.legacyTechnicianName.trim()}
                      </span>
                    </>
                  )}
                  {!selectedTechnician && !job?.legacyTechnicianName?.trim() && (
                    <span className="job-details-select-placeholder">Select a technician</span>
                  )}
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="job-details-select-arrow">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="#667085" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                
                {showTechDropdown && (!job.assignedTechnician || !['en_route', 'arrived', 'in_progress', 'completed', 'on_hold'].includes(job.job_status)) && (
                  <div className="job-details-tech-dropdown">
                    <div className="job-details-tech-search">
                      <input
                        type="text"
                        placeholder="Search technicians..."
                        value={techSearch}
                        onChange={(e) => setTechSearch(e.target.value)}
                        className="job-details-tech-search-input"
                      />
                    </div>
                    <div className="job-details-tech-list">
                      {filteredTechnicians.length === 0 && (
                        <div className="job-details-tech-item-empty">No technicians found</div>
                      )}
                      {filteredTechnicians.map(tech => (
                        <div
                          key={tech._id}
                          className="job-details-tech-item"
                          onClick={() => handleTechnicianSelect(tech)}
                        >
                          <img 
                            src={tech.profilePicture || "/icons/user.svg"} 
                            alt={tech.firstName}
                            className="job-details-tech-item-avatar"
                          />
                          <div className="job-details-tech-item-info">
                            <div className="job-details-tech-item-name">
                              {tech.firstName} {tech.lastName}
                            </div>
                            <div className="job-details-tech-item-status">
                              {tech.currentStatus}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="job-details-form-group">
              <label className="job-details-form-label">Technician's Vehicle</label>
              <div className="job-details-input-disabled">
                {selectedTechnician?.assignedVehicle && (
                  <>
                    <img 
                      src="/icons/car.png" 
                      alt="Vehicle" 
                      className="job-details-vehicle-icon"
                    />
                    <span className="job-details-input-text-disabled">
                      {selectedTechnician.assignedVehicle.year} {selectedTechnician.assignedVehicle.make?.name} {selectedTechnician.assignedVehicle.model?.name} - {selectedTechnician.assignedVehicle.plateNumber}
                    </span>
                  </>
                )}
                {!selectedTechnician?.assignedVehicle && (
                  <span className="job-details-input-text-disabled">No vehicle assigned</span>
                )}
              </div>
            </div>
          </div>

          {/* Reassignment History Section */}
          {job.reassignment_history && job.reassignment_history.length > 0 && (
            <div className="job-details-section-full">
              <h3 className="job-details-section-title">Reassignment History</h3>
              <div className="reassignment-history">
                {job.reassignment_history.map((reassignment, index) => (
                  <div key={index} className="reassignment-item">
                    <div className="reassignment-icon">
                      <img src="/icons/refresh.svg" alt="Reassigned" />
                    </div>
                    <div className="reassignment-content">
                      <div className="reassignment-text">
                        <strong>Reassigned from:</strong> {reassignment.from_technician?.firstName} {reassignment.from_technician?.lastName}
                        {' '}<strong>to:</strong> {reassignment.to_technician?.firstName} {reassignment.to_technician?.lastName}
                      </div>
                      <div className="reassignment-meta">
                        <span className="reassignment-date">
                          {new Date(reassignment.reassigned_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })}
                        </span>
                        {reassignment.reason && (
                          <span className="reassignment-reason"> • {reassignment.reason}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Job Pricing & Parts Section */}
          <div className="job-details-section-full">
            <h3 className="job-details-section-title">Job Pricing & Parts</h3>
            
            {!isPaid ? (
              /* Before Payment */
              <>
                <div className="job-details-pricing-row">
                  <div className="job-details-form-group">
                    <label className="job-details-form-label">Price</label>
                    <input 
                      type="text" 
                      className="job-details-input"
                      placeholder="0"
                      value={currentEstimate ? `QR ${currentEstimate.toFixed(2)}` : ''}
                      readOnly
                      disabled
                    />
                  </div>

                  <div className="job-details-form-group">
                    <label className="job-details-form-label">Parts Cost</label>
                    <input 
                      type="text" 
                      className="job-details-input job-details-input-error"
                      placeholder="0"
                      value={totalCost ? `QR ${totalCost.toFixed(2)}` : ''}
                      readOnly
                      disabled
                    />
                  </div>

                  <div className="job-details-form-group">
                    <label className="job-details-form-label">Service Charge</label>
                    <input 
                      type="text" 
                      className="job-details-input"
                      placeholder="0"
                      value={serviceCharge ? `QR ${serviceCharge.toFixed(2)}` : 'QR 0.00'}
                      readOnly
                      disabled
                    />
                  </div>
                </div>

                <div className="job-details-pricing-row">
                  <div className="job-details-form-group">
                    <label className="job-details-form-label">Profit</label>
                    <input 
                      type="text" 
                      className={`job-details-input ${currentProfit >= 0 ? 'job-details-input-success' : 'job-details-input-error'}`}
                      placeholder="0"
                      value={`QR ${currentProfit.toFixed(2)}`}
                      readOnly
                      disabled
                    />
                  </div>

                  <div className="job-details-form-group">
                    <label className="job-details-form-label">Dispatcher Estimate</label>
                    <input 
                      type="text" 
                      className="job-details-input"
                      placeholder="Not set"
                      value={dispatcherEstimate ? `QR ${dispatcherEstimate.toFixed(2)}` : 'N/A'}
                      readOnly
                      disabled
                    />
                  </div>

                  <div className="job-details-form-group">
                    <label className="job-details-form-label">Technician Estimate</label>
                    <input 
                      type="text" 
                      className="job-details-input"
                      placeholder="Not set"
                      value={technicianEstimate ? `QR ${technicianEstimate.toFixed(2)}` : 'N/A'}
                      readOnly
                      disabled
                    />
                  </div>
                </div>

                {/* Repair Procedures - Integrated */}
                <div className="job-details-repair-procedures">
                  {repairs.length === 0 ? (
                    <div className="job-details-repairs-empty-state">
                      <p className="job-details-empty-text">No repair procedures added yet</p>
                    </div>
                  ) : (
                    repairs.map((repair, index) => (
                      <div key={repair._id || index} className="job-details-repair-item">
                        <div className="job-details-repair-row">
                          <div className="job-details-form-group">
                            <label className="job-details-form-label">Repair Procedure</label>
                            <input 
                              type="text" 
                              className="job-details-input"
                              value={repair.name || repair.description || ''}
                              readOnly
                              disabled
                            />
                          </div>
                          <div className="job-details-form-group">
                            <label className="job-details-form-label">Parts Cost</label>
                            <input 
                              type="text" 
                              className="job-details-input"
                              value={`QR ${((Number(repair.cost) || 0) * (repair.quantity || 1)).toFixed(2)}`}
                              readOnly
                              disabled
                            />
                          </div>
                          <div className="job-details-form-group">
                            <label className="job-details-form-label">Quantity</label>
                            <input 
                              type="text" 
                              className="job-details-input"
                              value={repair.quantity || '1'}
                              readOnly
                              disabled
                            />
                          </div>
                          <div className="job-details-form-group">
                            <label className="job-details-form-label">Price</label>
                            <input 
                              type="text" 
                              className="job-details-input"
                              value={`QR ${repair.price?.toFixed(2) || '0.00'}`}
                              readOnly
                              disabled
                            />
                          </div>
                        </div>
                        
                        {repair.receipt_image_url && (
                          <div className="job-details-receipt-preview">
                            <div className="job-details-receipt-file">
                              <span className="job-details-receipt-label">Receipt Image</span>
                              <div className="job-details-receipt-item">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                  <path d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z" stroke="#494949" strokeWidth="1.5"/>
                                  <circle cx="16" cy="8" r="2" stroke="#494949" strokeWidth="1.5"/>
                                  <path d="M2 12.5001L3.75159 10.9675C4.66286 10.1702 6.03628 10.2159 6.89249 11.0721L11.1822 15.3618C11.8694 16.0491 12.9512 16.1428 13.7464 15.5839L14.0446 15.3744C15.1888 14.5702 16.7369 14.6634 17.7765 15.599L21 18.5001" stroke="#494949" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                                <a 
                                  href={repair.receipt_image_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="job-details-receipt-link"
                                >
                                  View Receipt
                                </a>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              /* After Payment */
              <>
                <div className="job-details-pricing-row" style={{ marginTop: '16px' }}>
                  <div className="job-details-form-group">
                    <label className="job-details-form-label">Price</label>
                    <input 
                      type="text" 
                      className="job-details-input"
                      placeholder="0"
                      value={currentEstimate ? `QR ${currentEstimate.toFixed(2)}` : ''}
                      readOnly
                      disabled
                    />
                  </div>

                  <div className="job-details-form-group">
                    <label className="job-details-form-label">Parts Cost</label>
                    <input 
                      type="text" 
                      className="job-details-input job-details-input-error"
                      placeholder="0"
                      value={totalCost ? `QR ${totalCost.toFixed(2)}` : ''}
                      readOnly
                      disabled
                    />
                  </div>

                  <div className="job-details-form-group">
                    <label className="job-details-form-label">Service Charge</label>
                    <input 
                      type="text" 
                      className="job-details-input"
                      placeholder="0"
                      value={serviceCharge ? `QR ${serviceCharge.toFixed(2)}` : 'QR 0.00'}
                      readOnly
                      disabled
                    />
                  </div>
                </div>

                <div className="job-details-pricing-row">
                  <div className="job-details-form-group">
                    <label className="job-details-form-label">Profit</label>
                    <input 
                      type="text" 
                      className={`job-details-input ${currentProfit >= 0 ? 'job-details-input-success' : 'job-details-input-error'}`}
                      placeholder="0"
                      value={`QR ${currentProfit.toFixed(2)}`}
                      readOnly
                      disabled
                    />
                  </div>

                  <div className="job-details-form-group">
                    <label className="job-details-form-label">Dispatcher Estimate</label>
                    <input 
                      type="text" 
                      className="job-details-input"
                      placeholder="Not set"
                      value={dispatcherEstimate ? `QR ${dispatcherEstimate.toFixed(2)}` : 'N/A'}
                      readOnly
                      disabled
                    />
                  </div>

                  <div className="job-details-form-group">
                    <label className="job-details-form-label">Technician Estimate</label>
                    <input 
                      type="text" 
                      className="job-details-input"
                      placeholder="Not set"
                      value={technicianEstimate ? `QR ${technicianEstimate.toFixed(2)}` : 'N/A'}
                      readOnly
                      disabled
                    />
                  </div>
                </div>

                {/* Repair Procedures - Integrated */}
                <div className="job-details-repair-procedures">
                  {repairs.length === 0 ? (
                    <div className="job-details-repairs-empty-state">
                      <p className="job-details-empty-text">No repair procedures added yet</p>
                    </div>
                  ) : (
                    repairs.map((repair, index) => (
                      <div key={repair._id || index} className="job-details-repair-item">
                        <div className="job-details-repair-row">
                          <div className="job-details-form-group">
                            <label className="job-details-form-label">Repair Procedure</label>
                            <input 
                              type="text" 
                              className="job-details-input"
                              value={repair.name || repair.description || ''}
                              readOnly
                              disabled
                            />
                          </div>
                          <div className="job-details-form-group">
                            <label className="job-details-form-label">Parts Cost</label>
                            <input 
                              type="text" 
                              className="job-details-input"
                              value={`QR ${((Number(repair.cost) || 0) * (repair.quantity || 1)).toFixed(2)}`}
                              readOnly
                              disabled
                            />
                          </div>
                          <div className="job-details-form-group">
                            <label className="job-details-form-label">Quantity</label>
                            <input 
                              type="text" 
                              className="job-details-input"
                              value={repair.quantity || '1'}
                              readOnly
                              disabled
                            />
                          </div>
                          <div className="job-details-form-group">
                            <label className="job-details-form-label">Price</label>
                            <input 
                              type="text" 
                              className="job-details-input"
                              value={`QR ${repair.price?.toFixed(2) || '0.00'}`}
                              readOnly
                              disabled
                            />
                          </div>
                        </div>
                        
                        {repair.receipt_image_url && (
                          <div className="job-details-receipt-preview">
                            <div className="job-details-receipt-file">
                              <span className="job-details-receipt-label">Receipt Image</span>
                              <div className="job-details-receipt-item">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                  <path d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z" stroke="#494949" strokeWidth="1.5"/>
                                  <circle cx="16" cy="8" r="2" stroke="#494949" strokeWidth="1.5"/>
                                  <path d="M2 12.5001L3.75159 10.9675C4.66286 10.1702 6.03628 10.2159 6.89249 11.0721L11.1822 15.3618C11.8694 16.0491 12.9512 16.1428 13.7464 15.5839L14.0446 15.3744C15.1888 14.5702 16.7369 14.6634 17.7765 15.599L21 18.5001" stroke="#494949" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                                <a 
                                  href={repair.receipt_image_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="job-details-receipt-link"
                                >
                                  View Receipt
                                </a>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Removed standalone Repair Procedures Section - now integrated above */}
        </div>

        {/* Action Buttons */}
        <div className="job-details-actions">
          <button 
            className={`job-details-btn ${job.job_status === 'completed' ? 'job-details-btn-secondary' : 'job-details-btn-secondary-disabled'}`}
            onClick={handleDownloadReceipt}
            disabled={job.job_status !== 'completed'}
          >
            Download Receipt
          </button>
          
          <button 
            className={`job-details-btn ${job.job_status === 'cancelled' || job.job_status === 'completed' ? 'job-details-btn-secondary-disabled' : 'job-details-btn-danger'}`}
            onClick={handleCancelJob}
            disabled={cancelling || job.job_status === 'cancelled' || job.job_status === 'completed'}
            title="Technicians cannot cancel — dispatch cancels here."
          >
            {cancelling ? 'Cancelling...' : job.job_status === 'cancelled' ? 'Job Cancelled' : job.job_status === 'completed' ? 'Job Completed' : 'Cancel Job'}
          </button>
          {HOLDABLE_STATUSES.includes(job.job_status) && job.hold_request?.status !== 'pending' && (
            <button
              className="job-details-btn job-details-btn-warning"
              onClick={handleHoldJob}
              disabled={holding}
            >
              {holding ? 'Holding...' : 'Put on hold'}
            </button>
          )}
          {job.job_status === 'on_hold' && (
            <button
              className="job-details-btn job-details-btn-primary"
              onClick={handleResumeJob}
              disabled={resuming}
            >
              {resuming ? 'Resuming...' : 'Resume job'}
            </button>
          )}
          {COMPLETABLE_STATUSES.includes(job.job_status) && (
            <button
              className="job-details-btn job-details-btn-primary"
              onClick={() => setShowCompleteModal(true)}
              disabled={completing}
            >
              {completing ? 'Completing...' : 'Mark as completed'}
            </button>
          )}
          <button 
            className="job-details-btn job-details-btn-primary"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
      
      {/* Cancel Job Modal with Reason */}
      {showCancelModal && (
        <div className="confirmation-modal-backdrop">
          <div className="confirmation-modal" style={{ maxWidth: '520px' }}>
            <button className="confirmation-modal-close" onClick={() => { setShowCancelModal(false); setCancelReason(''); setCancelReasonText(''); }} aria-label="Close">
              <span className="confirmation-modal-close-x">&#10005;</span>
            </button>
            <div className="confirmation-modal-content">
              <img src="/icons/warning.svg" alt="Warning" className="confirmation-modal-icon" width={64} height={64} />
              <div className="confirmation-modal-title">Cancel Job</div>
              <div className="confirmation-modal-message" style={{ marginBottom: '16px' }}>
                Technicians cannot cancel jobs. Cancel here to release the technician and notify the customer. Provide a reason.
              </div>
              
              <div className="cancel-reason-options">
                {[
                  'Customer not available',
                  'Wrong location',
                  'Parts not available',
                  'Vehicle not accessible',
                  'Customer requested cancellation',
                  'Scheduling conflict',
                  'Job created in error',
                  'Other'
                ].map((reason) => (
                  <label key={reason} className={`cancel-reason-option ${cancelReason === reason ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="cancelReason"
                      value={reason}
                      checked={cancelReason === reason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                    <span>{reason}</span>
                  </label>
                ))}
              </div>

              {cancelReason === 'Other' && (
                <textarea
                  className="cancel-reason-textarea"
                  placeholder="Please describe the reason..."
                  value={cancelReasonText}
                  onChange={(e) => setCancelReasonText(e.target.value)}
                  rows={3}
                />
              )}

              <div className="confirmation-modal-actions" style={{ marginTop: '20px' }}>
                <button className="confirmation-modal-cancel" onClick={() => { setShowCancelModal(false); setCancelReason(''); setCancelReasonText(''); }}>
                  Go Back
                </button>
                <button 
                  className="confirmation-modal-confirm" 
                  onClick={confirmCancelJob}
                  disabled={!cancelReason || (cancelReason === 'Other' && !cancelReasonText.trim())}
                  style={{ opacity: (!cancelReason || (cancelReason === 'Other' && !cancelReasonText.trim())) ? 0.5 : 1 }}
                >
                  Confirm Cancellation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCompleteModal && (
        <div className="confirmation-modal-backdrop">
          <div className="confirmation-modal" style={{ maxWidth: '520px' }}>
            <button className="confirmation-modal-close" onClick={() => { setShowCompleteModal(false); setCompleteNotes(''); setCompleteJobRef(''); }} aria-label="Close">
              <span className="confirmation-modal-close-x">&#10005;</span>
            </button>
            <div className="confirmation-modal-content confirmation-modal-content--form">
              <div className="confirmation-modal-title">Mark job as completed</div>
              <div className="confirmation-modal-message" style={{ marginBottom: '16px' }}>
                This closes the job in dispatch. Payment and signature are not required for admin completion.
              </div>
              <label className="job-details-label" style={{ display: 'block' }}>
                Job ID / reference (optional)
              </label>
              <input
                type="text"
                className="job-details-input"
                value={completeJobRef}
                onChange={(e) => setCompleteJobRef(e.target.value)}
                maxLength={64}
                placeholder="External job reference"
              />
              <label className="job-details-label" style={{ display: 'block', marginTop: '12px' }}>
                Completion notes (optional)
              </label>
              <textarea
                className="cancel-reason-textarea"
                placeholder="Notes for dispatch records"
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
                rows={3}
                maxLength={2000}
              />
              <div className="confirmation-modal-actions" style={{ marginTop: '20px' }}>
                <button className="confirmation-modal-cancel" onClick={() => { setShowCompleteModal(false); setCompleteNotes(''); setCompleteJobRef(''); }}>
                  Go Back
                </button>
                <button
                  className="confirmation-modal-confirm"
                  onClick={confirmCompleteJob}
                  disabled={completing}
                  style={{ opacity: completing ? 0.5 : 1 }}
                >
                  {completing ? 'Completing...' : 'Mark completed'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showHoldModal && (
        <div className="confirmation-modal-backdrop">
          <div className="confirmation-modal" style={{ maxWidth: '520px' }}>
            <button className="confirmation-modal-close" onClick={() => { setShowHoldModal(false); setHoldReason(''); setHoldReturnDate(''); }} aria-label="Close">
              <span className="confirmation-modal-close-x">&#10005;</span>
            </button>
            <div className="confirmation-modal-content confirmation-modal-content--form">
              <div className="confirmation-modal-title">Put job on hold</div>
              <div className="confirmation-modal-message" style={{ marginBottom: '16px' }}>
                Enter a reason. Dispatch and the technician will see this on the job.
              </div>
              <textarea
                className="cancel-reason-textarea"
                placeholder="Car sent to garage for 2-day maintenance"
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                rows={4}
                maxLength={2000}
              />
              <label className="job-details-label" style={{ display: 'block', marginTop: '12px' }}>
                Scheduled return (optional)
              </label>
              <input
                type="date"
                className="job-details-input"
                value={holdReturnDate}
                onChange={(e) => setHoldReturnDate(e.target.value)}
              />
              <div className="confirmation-modal-actions" style={{ marginTop: '20px' }}>
                <button className="confirmation-modal-cancel" onClick={() => { setShowHoldModal(false); setHoldReason(''); setHoldReturnDate(''); }}>
                  Go Back
                </button>
                <button
                  className="confirmation-modal-confirm"
                  onClick={confirmHoldJob}
                  disabled={!holdReason.trim() || holding}
                  style={{ opacity: (!holdReason.trim() || holding) ? 0.5 : 1 }}
                >
                  {holding ? 'Holding...' : 'Confirm hold'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRejectHoldModal && (
        <div className="confirmation-modal-backdrop">
          <div className="confirmation-modal" style={{ maxWidth: '520px' }}>
            <button className="confirmation-modal-close" onClick={() => { setShowRejectHoldModal(false); setRejectHoldNote(''); }} aria-label="Close">
              <span className="confirmation-modal-close-x">&#10005;</span>
            </button>
            <div className="confirmation-modal-content">
              <div className="confirmation-modal-title">Reject hold request</div>
              <p className="confirmation-modal-subtitle">Optional note for the technician</p>
              <textarea
                className="cancel-reason-textarea"
                placeholder="Reason for rejection (optional)"
                value={rejectHoldNote}
                onChange={(e) => setRejectHoldNote(e.target.value)}
                rows={3}
              />
              <div className="confirmation-modal-actions" style={{ marginTop: '20px' }}>
                <button className="confirmation-modal-cancel" onClick={() => { setShowRejectHoldModal(false); setRejectHoldNote(''); }}>
                  Cancel
                </button>
                <button
                  className="confirmation-modal-confirm"
                  onClick={confirmRejectHoldRequest}
                  disabled={rejectingHoldRequest}
                  style={{ opacity: rejectingHoldRequest ? 0.5 : 1 }}
                >
                  {rejectingHoldRequest ? 'Rejecting…' : 'Reject request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Success Modal */}
      <SuccessModal
        open={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title={successMessage.title}
        subtitle={successMessage.subtitle}
      />
    </div>
  );
}

export default JobDetails;
