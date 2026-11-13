const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const ctrl = require("../controllers/customerVehicleController");

router.get("/", authenticateToken, requireFullAdmin, ctrl.listVehicles);

module.exports = router;
