const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps } = require("../middleware/rbac");
const controller = require("../controllers/contactUsAdminController");

// Support tickets are an ops workflow (see rbac.js header).
router.get("/", authenticateToken, requireOps, controller.listTickets);
router.get("/:id", authenticateToken, requireOps, controller.getTicket);
router.patch("/:id", authenticateToken, requireOps, controller.updateTicket);
router.post("/:id/replies", authenticateToken, requireOps, controller.addReply);

module.exports = router;
