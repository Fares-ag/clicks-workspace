const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps, requireFullAdmin } = require("../middleware/rbac");
const sourceController = require("../controllers/sourceController");

router.get("/", authenticateToken, requireOps, sourceController.getSources);
router.post("/", authenticateToken, requireFullAdmin, sourceController.createSource);
router.get("/:id", authenticateToken, requireOps, sourceController.getSourceById);
router.put("/:id", authenticateToken, requireFullAdmin, sourceController.updateSource);
router.delete("/:id", authenticateToken, requireFullAdmin, sourceController.deleteSource);
router.delete(
  "/:id/subsources/:subSourceId",
  authenticateToken,
  requireFullAdmin,
  sourceController.deleteSubSource
);

module.exports = router;
