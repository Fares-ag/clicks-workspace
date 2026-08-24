const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const adminController = require("../controllers/adminController");
const adminAuditController = require("../controllers/adminAuditController");
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");

router.get("/audit-log", authenticateToken, requireFullAdmin, adminAuditController.listAuditLog);

router.get("/", authenticateToken, requireFullAdmin, adminController.getAdmins);

router.post(
  "/",
  authenticateToken,
  requireFullAdmin,
  upload.single("profileImage"),
  adminController.createAdmin
);

router.get("/:id", authenticateToken, requireFullAdmin, adminController.getAdminById);

router.put("/:id", authenticateToken, requireFullAdmin, adminController.updateAdmin);

router.put(
  "/:id/status",
  authenticateToken,
  requireFullAdmin,
  adminController.toggleAdminStatus
);

router.delete("/:id", authenticateToken, requireFullAdmin, adminController.deleteAdmin);

router.post(
  "/:id/upload-profile",
  authenticateToken,
  requireFullAdmin,
  upload.single("file"),
  adminController.uploadProfilePicture
);

module.exports = router;
