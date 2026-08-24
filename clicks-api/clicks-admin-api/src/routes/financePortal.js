const express = require("express");
const router = express.Router();
const authenticateFinance = require("../middleware/authenticateFinance");
const { requireFinanceRole } = require("../middleware/authenticateFinance");
const { authLimiter } = require("../middleware/rateLimiter");
const financePortalController = require("../controllers/financePortalController");
const financeVendorController = require("../controllers/financeVendorController");
const financePurchaseController = require("../controllers/financePurchaseController");

router.post("/auth/login", authLimiter, financePortalController.login);

router.get("/me", authenticateFinance, financePortalController.me);
router.get("/dashboard", authenticateFinance, financePortalController.dashboard);

// Vendors are finance-owned: the admin console has no vendor CRUD.
router.get("/vendors", authenticateFinance, financeVendorController.listVendors);
router.post("/vendors", authenticateFinance, financeVendorController.createVendor);
router.patch("/vendors/:id", authenticateFinance, financeVendorController.updateVendor);
router.delete("/vendors/:id", authenticateFinance, financeVendorController.deleteVendor);

router.get("/purchases", authenticateFinance, financePurchaseController.listPurchases);
router.get("/purchases/summary", authenticateFinance, financePurchaseController.vendorSummary);
router.get("/purchases/export.csv", authenticateFinance, financePurchaseController.exportPurchasesCsv);
router.get("/jobs/:jobId/purchases", authenticateFinance, financePurchaseController.listJobPurchases);
router.post("/jobs/:jobId/purchases", authenticateFinance, financePurchaseController.createPurchase);
router.patch("/purchases/:id", authenticateFinance, financePurchaseController.updatePurchase);
router.delete("/purchases/:id", authenticateFinance, financePurchaseController.voidPurchase);

router.get("/technicians", authenticateFinance, financePortalController.listTechnicians);

router.get("/jobs", authenticateFinance, financePortalController.listJobs);
// Declared before "/jobs/:id" — otherwise the param route swallows "export.csv".
router.get("/jobs/export.csv", authenticateFinance, financePortalController.exportJobsCsv);
router.get("/jobs/:id/history", authenticateFinance, financePortalController.getJobHistory);
router.get("/jobs/:id", authenticateFinance, financePortalController.getJob);
router.patch("/jobs/:id/finance", authenticateFinance, financePortalController.updateFinance);
router.post("/jobs/:id/audit", authenticateFinance, financePortalController.auditJob);
// Re-auditing an audited job is the one way past the lock without reopening it:
// it demands a reason and stamps the job as re-audited.
// Open to any finance operator by design, per the contract ("all under
// /api/finance, all behind authenticateFinance"): re-audit is the operator's
// correction path and every use records a mandatory reason in FinanceAuditLog.
// Reopening below stays admin-only because it clears the lock outright and
// leaves the money freely editable afterwards with no reason attached. If
// audited money must be admin-gated too, add requireFinanceRole("admin") here.
router.post("/jobs/:id/reaudit", authenticateFinance, financePortalController.reauditJob);
// Editing and auditing are the operator's day job; only unlocking an already
// audited job (which lets its revenue/cost/profit snapshot be rewritten) is
// restricted to the senior "admin" finance role.
router.post(
  "/jobs/:id/reopen",
  authenticateFinance,
  requireFinanceRole("admin"),
  financePortalController.reopenAudit
);

module.exports = router;
