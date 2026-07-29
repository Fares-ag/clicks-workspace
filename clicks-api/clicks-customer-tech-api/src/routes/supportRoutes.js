const express = require("express");
const router = express.Router();
const supportController = require("../controllers/supportController");
const { authenticate } = require("../middleware/auth");

router.post("/tickets", authenticate(["customer"]), supportController.createTicket);
router.get("/tickets", authenticate(["customer"]), supportController.getTickets);
router.put("/tickets/:id", authenticate(["admin"]), supportController.updateTicket);
router.get("/types", supportController.getTicketTypes);

module.exports = router;
