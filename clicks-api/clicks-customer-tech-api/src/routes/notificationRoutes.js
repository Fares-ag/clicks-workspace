const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const notificationController = require("../controllers/notificationController");

router.get("/customer", authenticate(["customer"]), notificationController.listCustomer);
router.get(
  "/customer/unread-count",
  authenticate(["customer"]),
  notificationController.unreadCount
);
router.post(
  "/customer/mark-all-read",
  authenticate(["customer"]),
  notificationController.markAllRead
);
router.delete(
  "/customer/clear-all",
  authenticate(["customer"]),
  notificationController.clearAll
);
router.patch(
  "/customer/:id/read",
  authenticate(["customer"]),
  notificationController.markRead
);

router.get("/technician", authenticate(["technician"]), (_req, res) => {
  res.json({ notifications: [] });
});
router.get(
  "/technician/unread-count",
  authenticate(["technician"]),
  (_req, res) => {
    res.json({ count: 0 });
  }
);
router.post(
  "/technician/mark-all-read",
  authenticate(["technician"]),
  (_req, res) => {
    res.json({ message: "ok" });
  }
);

module.exports = router;
