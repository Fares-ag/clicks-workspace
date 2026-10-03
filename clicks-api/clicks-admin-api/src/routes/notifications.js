const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps } = require("../middleware/rbac");
const notificationController = require("../controllers/notificationController");

router.get("/", authenticateToken, requireOps, notificationController.listNotifications);
router.get(
  "/unread-count",
  authenticateToken,
  requireOps,
  notificationController.getUnreadCount
);
router.post(
  "/mark-read",
  authenticateToken,
  requireOps,
  notificationController.markRead
);

module.exports = router;
