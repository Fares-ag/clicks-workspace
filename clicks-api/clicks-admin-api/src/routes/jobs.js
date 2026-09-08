const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps, requireFullAdmin } = require("../middleware/rbac");
const uploadXlsx = require("../middleware/uploadXlsx");
const jobController = require("../controllers/jobController");
const jobHeatmapController = require("../controllers/jobHeatmapController");

router.get("/", authenticateToken, requireOps, jobController.getJobs);
router.post("/", authenticateToken, requireOps, jobController.createJob);
// Must be registered before /:id so named paths are not captured as an id
router.get(
  "/heatmap",
  authenticateToken,
  requireFullAdmin,
  jobHeatmapController.getJobHeatmap
);
router.get(
  "/nearby",
  authenticateToken,
  requireFullAdmin,
  jobHeatmapController.getJobsNearby
);
router.post(
  "/import",
  authenticateToken,
  requireFullAdmin,
  (req, res, next) => {
    uploadXlsx.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || "File upload failed" });
      }
      next();
    });
  },
  jobController.importJobs
);
router.get("/:id", authenticateToken, requireOps, jobController.getJobById);
router.put("/:id", authenticateToken, requireOps, jobController.updateJob);
router.post("/:id/hold", authenticateToken, requireOps, jobController.holdJob);
router.post("/:id/resume", authenticateToken, requireOps, jobController.resumeJob);
router.post("/:id/complete", authenticateToken, requireOps, jobController.completeJob);
router.post(
  "/:id/hold-request/approve",
  authenticateToken,
  requireOps,
  jobController.approveHoldRequestJob
);
router.post(
  "/:id/hold-request/reject",
  authenticateToken,
  requireOps,
  jobController.rejectHoldRequestJob
);
router.delete("/:id", authenticateToken, requireFullAdmin, jobController.deleteJob);
router.get("/:id/repairs", authenticateToken, requireOps, jobController.getJobRepairs);

module.exports = router;
