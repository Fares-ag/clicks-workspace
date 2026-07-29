const express = require("express");
const router = express.Router();
const repairProcedureController = require("../controllers/repairProcedureController");
const { authenticate } = require("../middleware/auth");

const upload = require("../middleware/upload");

router.post("/", authenticate(["technician"]), upload.single("receipt_image"), repairProcedureController.createRepairProcedure);
router.get("/", authenticate(["technician", "customer"]), repairProcedureController.getRepairProcedures);
router.put("/:id", authenticate(["technician"]), repairProcedureController.updateRepairProcedure);
router.delete("/:id", authenticate(["technician"]), repairProcedureController.deleteRepairProcedure);

module.exports = router;
