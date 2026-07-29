const express = require("express");
const router = express.Router();
const contactUsController = require("../controllers/contactUsController");
const { authenticate } = require("../middleware/auth");

router.post("/", authenticate(["customer"]), contactUsController.createContactUsRequest);
router.get("/", authenticate(["customer"]), contactUsController.getContactUsRequests);

module.exports = router;
