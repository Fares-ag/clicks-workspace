const express = require("express");
const router = express.Router();
const {
  getFAQs,
  getPrivacyPolicy,
  getTermsAndConditions
} = require("../controllers/contentController");

router.get("/faqs", getFAQs);
router.get("/privacy-policy", getPrivacyPolicy);
router.get("/terms-and-conditions", getTermsAndConditions);

module.exports = router;
