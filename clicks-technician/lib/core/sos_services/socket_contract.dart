/// Socket contract: technician app ↔ clicks-customer-tech-api
///
/// Source of truth for event names (verified against sosSocketService.js):
///
/// Server → technician:
///   newJobAssigned (canonical; handoff name "jobAssigned" is wrong)
///   enRouteConfirmed, arrivedConfirmed, jobStartedConfirmed
///   paymentConfirmed, jobCancelled, error
///   jobReassigned — not emitted by API today; client listens for forward-compat
///
/// Technician → server:
///   register (no payload; id from JWT)
///   updateLocation { technician_id, latitude, longitude, job_id? }
///   startEnRoute | markArrived | startJob { job_id } — server handlers exist,
///     but the app must NOT emit these after REST: REST already advanced status
///     and notified the customer; a second emit fails the status gate → error toast.
///   paymentReceived { job_id, payment_method?, notes? } — emit after REST
///     confirmPayment (REST does not notify the customer socket).
///
/// App policy: REST is primary for en_route / arrived / start / complete.
/// Socket paymentReceived supplements REST payment for live customer updates.
library;
