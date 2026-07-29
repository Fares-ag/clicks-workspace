const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps, requireFullAdmin } = require("../middleware/rbac");
const jobController = require("../controllers/jobController");

router.get("/", authenticateToken, requireOps, jobController.getJobs);
router.post("/", authenticateToken, requireOps, jobController.createJob);
router.get("/:id", authenticateToken, requireOps, jobController.getJobById);
router.put("/:id", authenticateToken, requireOps, jobController.updateJob);
router.delete("/:id", authenticateToken, requireFullAdmin, jobController.deleteJob);
router.get("/:id/repairs", authenticateToken, requireOps, jobController.getJobRepairs);

module.exports = router;
