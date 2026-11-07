// Moved to clicks-shared/services/jobPayment.js so the admin API (finance
// mark-paid, admin complete) and the reconciliation sweep use one money path.
const {
  applyJobPayment,
  invalidateTechSessionCache,
} = require("../../../clicks-shared/services/jobPayment");

module.exports = {
  applyJobPayment,
  invalidateTechSessionCache,
};
