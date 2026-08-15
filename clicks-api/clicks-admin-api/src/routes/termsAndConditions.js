const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const {
  getTermsAndConditions,
  getActiveTermsAndConditions,
  createTermsAndConditions,
  updateTermsAndConditions,
  deleteTermsAndConditions,
} = require("../controllers/termsAndConditionsController");

router.get("/active", getActiveTermsAndConditions); // public
router.get("/", authenticateToken, requireFullAdmin, getTermsAndConditions);
router.post("/", authenticateToken, requireFullAdmin, createTermsAndConditions);
router.put("/:id", authenticateToken, requireFullAdmin, updateTermsAndConditions);
router.delete("/:id", authenticateToken, requireFullAdmin, deleteTermsAndConditions);

module.exports = router;
