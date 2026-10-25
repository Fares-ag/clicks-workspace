const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const ctrl = require("../controllers/dataAnalysisController");

router.use(authenticateToken, requireFullAdmin);

router.get("/overview", ctrl.overview);
router.get("/customers", ctrl.customers);
router.get("/vehicles", ctrl.vehicles);
router.get("/issues", ctrl.issues);
router.get("/services", ctrl.services);
router.get("/sources", ctrl.sources);
router.get("/time", ctrl.time);
router.get("/locations", ctrl.locations);
router.get("/crosstabs", ctrl.crosstabs);
router.get("/jobs", ctrl.jobs);
router.get("/catalogs", ctrl.catalogs);
router.get("/export", ctrl.exportDataset);
router.get("/quality", ctrl.quality);
router.post("/quality/preview", ctrl.qualityPreview);
router.post("/quality/apply", ctrl.qualityApply);
router.post("/quality/aliases", ctrl.qualityAlias);

module.exports = router;
