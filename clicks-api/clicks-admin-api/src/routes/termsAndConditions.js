const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const {
  getTermsAndConditions,
  getActiveTermsAndConditions,
  createTermsAndConditions,
  updateTermsAndConditions,
  deleteTermsAndConditions,
} = require("../controllers/termsAndConditionsController");

router.get("/active", getActiveTermsAndConditions); // public
router.get("/", authenticateToken, getTermsAndConditions);
router.post("/", authenticateToken, createTermsAndConditions);
router.put("/:id", authenticateToken, updateTermsAndConditions);
router.delete("/:id", authenticateToken, deleteTermsAndConditions);

module.exports = router;
