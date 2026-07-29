const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const customerController = require("../controllers/customerController");

router.get("/", authenticateToken, customerController.getCustomers);
router.get("/:id", authenticateToken, customerController.getCustomerById);
router.put("/:id", authenticateToken, customerController.updateCustomer);
router.delete("/:id", authenticateToken, customerController.deleteCustomer);

module.exports = router;
