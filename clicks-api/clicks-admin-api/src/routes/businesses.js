const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const businessAdminController = require("../controllers/businessAdminController");

router.get("/", authenticateToken, requireFullAdmin, businessAdminController.listBusinesses);
router.post("/", authenticateToken, requireFullAdmin, businessAdminController.createBusiness);
router.get(
  "/:id/stats",
  authenticateToken,
  requireFullAdmin,
  businessAdminController.getBusinessStats
);
router.get("/:id", authenticateToken, requireFullAdmin, businessAdminController.getBusiness);
router.patch("/:id", authenticateToken, requireFullAdmin, businessAdminController.updateBusiness);
router.post(
  "/:id/users",
  authenticateToken,
  requireFullAdmin,
  businessAdminController.createBusinessUser
);
router.patch(
  "/:id/users/:userId",
  authenticateToken,
  requireFullAdmin,
  businessAdminController.updateBusinessUser
);
router.post(
  "/:id/users/:userId/reset-password",
  authenticateToken,
  requireFullAdmin,
  businessAdminController.resetBusinessUserPassword
);

module.exports = router;
