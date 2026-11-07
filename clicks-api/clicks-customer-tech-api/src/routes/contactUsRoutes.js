const express = require("express");
const router = express.Router();
const contactUsController = require("../controllers/contactUsController");
const { authenticate } = require("../middleware/auth");
const { authenticateInternal } = require("../middleware/internalAuth");

router.post("/", authenticate(["customer"]), contactUsController.createContactUsRequest);
router.get("/", authenticate(["customer"]), contactUsController.getContactUsRequests);
// Internal before the parametric route.
router.post("/internal/notify", authenticateInternal, contactUsController.notifyTicketUpdate);
router.get("/:id", authenticate(["customer"]), contactUsController.getContactUsRequestById);

module.exports = router;
