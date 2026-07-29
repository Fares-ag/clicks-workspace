const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const {
  getFAQs,
  getActiveFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ,
} = require("../controllers/faqController");

router.get("/active", getActiveFAQs); // public
router.get("/", authenticateToken, getFAQs);
router.post("/", authenticateToken, createFAQ);
router.put("/:id", authenticateToken, updateFAQ);
router.delete("/:id", authenticateToken, deleteFAQ);

module.exports = router;
