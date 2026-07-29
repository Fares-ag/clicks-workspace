const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");

// MVP stubs — rich notification center deferred
router.get("/customer", authenticate(["customer"]), (_req, res) => {
  res.json({ notifications: [] });
});
router.get("/customer/unread-count", authenticate(["customer"]), (_req, res) => {
  res.json({ count: 0 });
});
router.post(
  "/customer/mark-all-read",
  authenticate(["customer"]),
  (_req, res) => {
    res.json({ message: "ok" });
  }
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
