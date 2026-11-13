const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireOps, requireFullAdmin } = require("../middleware/rbac");
const customerController = require("../controllers/customerController");
const customerVehicleController = require("../controllers/customerVehicleController");

router.get("/", authenticateToken, requireOps, customerController.getCustomers);
router.get("/:id/vehicles", authenticateToken, requireFullAdmin, customerVehicleController.listForCustomer);
router.get("/:id", authenticateToken, requireOps, customerController.getCustomerById);
router.put("/:id", authenticateToken, requireOps, customerController.updateCustomer);
router.delete("/:id", authenticateToken, requireFullAdmin, customerController.deleteCustomer);

module.exports = router;
