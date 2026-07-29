const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const ctrl = require("../controllers/partnerController");

router.get("/", authenticateToken, requireFullAdmin, ctrl.listPartners);
router.post("/", authenticateToken, requireFullAdmin, ctrl.createPartner);
router.get("/:id", authenticateToken, requireFullAdmin, ctrl.getPartner);
router.patch("/:id", authenticateToken, requireFullAdmin, ctrl.updatePartner);
router.post(
  "/:id/start-next-period",
  authenticateToken,
  requireFullAdmin,
  ctrl.startNextPeriod
);
router.get("/:id/earnings", authenticateToken, requireFullAdmin, ctrl.listEarnings);
router.get(
  "/:id/withdrawals",
  authenticateToken,
  requireFullAdmin,
  ctrl.listPartnerWithdrawals
);
router.patch(
  "/:id/withdrawals/:withdrawalId",
  authenticateToken,
  requireFullAdmin,
  ctrl.updatePartnerWithdrawal
);

module.exports = router;
