const CANCEL_REASON_LABELS = {
  no_longer_needed: "Issue resolved on my own",
  switching: "Accidentally made the request",
  privacy: "Changed my mind",
  foundanotherserviceprovider: "Found another provider",
  other: "Other",
  cancelled_by_customer: "Cancelled by customer",
};

export function formatCancelReason(reason) {
  if (!reason || typeof reason !== "string") return "—";
  const trimmed = reason.trim();
  if (!trimmed) return "—";
  return CANCEL_REASON_LABELS[trimmed] || trimmed;
}
