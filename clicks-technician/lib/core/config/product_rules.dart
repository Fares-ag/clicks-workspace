/// Locked product rules after home_flow handoff gap analysis.
///
/// Do not reverse these without an explicit product decision.
class ProductRules {
  ProductRules._();

  /// Customer e-signs on the technician device before [completeJob].
  /// Editing job details after a signature clears it and requires re-sign.
  /// (Handoff placed signature on Payment instead — we keep complete-gate.)
  static const bool requireSignatureBeforeComplete = true;

  /// Technician sales product is Subscriptions (admin attribution),
  /// not Vehicle Insurance AddInsurance from the handoff.
  static const bool subscriptionsArePrimarySalesProduct = true;

  /// Incoming job popup is accept-only; no reject CTA.
  /// Active job also has no Cancel/Reject bail-out — admin cancels if needed.
  static const bool allowRejectOnIncomingJob = false;

  /// Canonical socket event for a newly assigned job (tech-api emits this).
  /// Handoff docs incorrectly name it `jobAssigned`.
  static const String socketNewJobAssigned = 'newJobAssigned';

  /// Handoff alias — listened for compatibility only.
  static const String socketNewJobAssignedAlias = 'jobAssigned';
}
