const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const sourceController = require("../controllers/sourceController");

router.get("/", authenticateToken, sourceController.getSources);
router.post("/", authenticateToken, sourceController.createSource);
router.get("/:id", authenticateToken, sourceController.getSourceById);
router.put("/:id", authenticateToken, sourceController.updateSource);
router.delete("/:id", authenticateToken, sourceController.deleteSource);
router.delete(
  "/:id/subsources/:subSourceId",
  authenticateToken,
  sourceController.deleteSubSource
);

module.exports = router;
