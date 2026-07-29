const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const {
  getPrivacyPolicies,
  getActivePrivacyPolicy,
  createPrivacyPolicy,
  updatePrivacyPolicy,
  deletePrivacyPolicy,
} = require("../controllers/privacyPolicyController");

router.get("/active", getActivePrivacyPolicy); // public
router.get("/", authenticateToken, getPrivacyPolicies);
router.post("/", authenticateToken, createPrivacyPolicy);
router.put("/:id", authenticateToken, updatePrivacyPolicy);
router.delete("/:id", authenticateToken, deletePrivacyPolicy);

module.exports = router;
