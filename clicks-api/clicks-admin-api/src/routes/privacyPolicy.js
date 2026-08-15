const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const {
  getPrivacyPolicies,
  getActivePrivacyPolicy,
  createPrivacyPolicy,
  updatePrivacyPolicy,
  deletePrivacyPolicy,
} = require("../controllers/privacyPolicyController");

router.get("/active", getActivePrivacyPolicy); // public
router.get("/", authenticateToken, requireFullAdmin, getPrivacyPolicies);
router.post("/", authenticateToken, requireFullAdmin, createPrivacyPolicy);
router.put("/:id", authenticateToken, requireFullAdmin, updatePrivacyPolicy);
router.delete("/:id", authenticateToken, requireFullAdmin, deletePrivacyPolicy);

module.exports = router;
