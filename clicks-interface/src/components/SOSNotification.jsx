import React, { useState, useEffect } from 'react';
import './SOSNotification.css';
import NotificationQueueNote from './NotificationQueueNote.jsx';

function SOSNotification({
  sosData,
  onCreateJob,
  onSchedule,
  onCloseNotAJob,
  onDismiss,
  queueCount = 0,
}) {
  const [timeLeft, setTimeLeft] = useState(60);
  const [mode, setMode] = useState('actions');
  const [serviceType, setServiceType] = useState(sosData.service_type || '');
  const [scheduledFor, setScheduledFor] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const expiresAt = sosData.expires_at
      ? new Date(sosData.expires_at)
      : new Date(Date.now() + 60000);

    const interval = setInterval(() => {
      const now = new Date();
      const secondsLeft = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeLeft(secondsLeft);
    }, 1000);

    return () => clearInterval(interval);
  }, [sosData.expires_at]);

  const customer = sosData.customer || {};
  const vehicle = sosData.vehicle || {};
  const location = sosData.location || {};
  const upcoming = sosData.upcoming_bookings || [];

  const submitSchedule = async () => {
    if (!scheduledFor || !onSchedule) return;
    setBusy(true);
    try {
      await onSchedule(sosData, {
        service_type: serviceType || 'Roadside service',
        scheduled_for: new Date(scheduledFor).toISOString(),
      });
    } finally {
      setBusy(false);
    }
  };

  const submitClose = async () => {
    if (!closeReason.trim() || !onCloseNotAJob) return;
    setBusy(true);
    try {
      await onCloseNotAJob(sosData, closeReason.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sos-notification-overlay">
      <div className="sos-notification-modal">
        <div className="sos-header">
          <h2 className="sos-header-title">Emergency SOS Request</h2>
          <button className="sos-close-btn" onClick={onDismiss}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11 1L1 11M1 1L11 11" stroke="#98A2B3" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="sos-content">
          <NotificationQueueNote queueCount={queueCount} />

          <div className="sos-timer">
            <span className="sos-timer-label">
              {sosData.after_hours
                ? "After hours — still open:"
                : timeLeft > 0
                  ? "Contact promise:"
                  : "Overdue — still open:"}
            </span>
            <span className="sos-timer-value">
              {timeLeft > 0 ? `${timeLeft}S` : "OPEN"}
            </span>
          </div>

          {upcoming.length > 0 && (
            <div className="sos-section">
              <h3 className="sos-section-title">Existing booking</h3>
              {upcoming.map((b) => (
                <p key={b.id} className="sos-info-value">
                  {b.service_type} · {b.scheduled_for
                    ? new Date(b.scheduled_for).toLocaleString()
                    : "scheduled"}
                </p>
              ))}
            </div>
          )}

          <div className="sos-section">
            <h3 className="sos-section-title">Customer Information</h3>
            <div className="sos-info-row">
              <div className="sos-info-group">
                <span className="sos-info-label">Name</span>
                <span className="sos-info-value">{customer.name || 'Unknown'}</span>
              </div>
              <div className="sos-info-group">
                <span className="sos-info-label">Contact Number</span>
                <span className="sos-info-value">{customer.phone || 'Unknown'}</span>
              </div>
            </div>
          </div>

          <div className="sos-section">
            <h3 className="sos-section-title">Vehicle Details</h3>
            <div className="sos-info-row">
              <div className="sos-info-column">
                <div className="sos-info-group">
                  <span className="sos-info-label">Make</span>
                  <span className="sos-info-value">{vehicle.make || 'Unknown'}</span>
                </div>
                <div className="sos-info-group">
                  <span className="sos-info-label">Year</span>
                  <span className="sos-info-value">{vehicle.year || 'Unknown'}</span>
                </div>
                <div className="sos-info-group">
                  <span className="sos-info-label">License Plate</span>
                  <span className="sos-info-value">{vehicle.plate || vehicle.licensePlate || 'Unknown'}</span>
                </div>
              </div>
              <div className="sos-info-column">
                <div className="sos-info-group">
                  <span className="sos-info-label">Model</span>
                  <span className="sos-info-value">{vehicle.model || 'Unknown'}</span>
                </div>
                <div className="sos-info-group">
                  <span className="sos-info-label">Color</span>
                  <span className="sos-info-value">{vehicle.color || 'Unknown'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="sos-section">
            <h3 className="sos-section-title">Location</h3>
            <div className="sos-location-row">
              <div className="sos-location-item">
                <span className="sos-info-label">Lat</span>
                <span className="sos-info-value">{location.latitude?.toFixed?.(7) || location.latitude || 'Unknown'}</span>
              </div>
              <div className="sos-location-item">
                <span className="sos-info-label">Long</span>
                <span className="sos-info-value">{location.longitude?.toFixed?.(8) || location.longitude || 'Unknown'}</span>
              </div>
            </div>
          </div>

          {mode === 'schedule' && (
            <div className="sos-section">
              <h3 className="sos-section-title">Schedule for later</h3>
              <input
                className="sos-inbox-select"
                placeholder="Service type"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
              />
              <input
                className="sos-inbox-select"
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                style={{ marginTop: 8 }}
              />
            </div>
          )}

          {mode === 'close' && (
            <div className="sos-section">
              <h3 className="sos-section-title">Not a job</h3>
              <input
                className="sos-inbox-select"
                placeholder="Reason the customer will see"
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
              />
            </div>
          )}

          <div className="sos-actions">
            {mode === 'actions' && (
              <>
                <button className="sos-btn-create-job" onClick={() => onCreateJob(sosData)}>
                  Create job
                </button>
                {onSchedule && (
                  <button
                    type="button"
                    className="sos-btn-create-job sos-btn-secondary"
                    onClick={() => setMode('schedule')}
                  >
                    Schedule
                  </button>
                )}
                {onCloseNotAJob && (
                  <button
                    type="button"
                    className="sos-btn-create-job sos-btn-muted"
                    onClick={() => setMode('close')}
                  >
                    Not a job
                  </button>
                )}
              </>
            )}
            {mode === 'schedule' && (
              <>
                <button className="sos-btn-create-job" disabled={busy || !scheduledFor} onClick={submitSchedule}>
                  Confirm booking
                </button>
                <button className="sos-close-btn" style={{ marginTop: 8 }} onClick={() => setMode('actions')}>
                  Back
                </button>
              </>
            )}
            {mode === 'close' && (
              <>
                <button className="sos-btn-create-job" disabled={busy || !closeReason.trim()} onClick={submitClose}>
                  Close request
                </button>
                <button className="sos-close-btn" style={{ marginTop: 8 }} onClick={() => setMode('actions')}>
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SOSNotification;
