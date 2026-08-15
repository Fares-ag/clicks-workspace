const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const {
  getFAQs,
  getActiveFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ,
} = require("../controllers/faqController");

router.get("/active", getActiveFAQs); // public
router.get("/", authenticateToken, requireFullAdmin, getFAQs);
router.post("/", authenticateToken, requireFullAdmin, createFAQ);
router.put("/:id", authenticateToken, requireFullAdmin, updateFAQ);
router.delete("/:id", authenticateToken, requireFullAdmin, deleteFAQ);

module.exports = router;
