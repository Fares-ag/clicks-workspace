const express = require("express");
const router = express.Router();
const authenticateToken = require("../middleware/auth");
const { requireFullAdmin } = require("../middleware/rbac");
const financeAdminController = require("../controllers/financeAdminController");

router.use(authenticateToken, requireFullAdmin);

router.get("/", financeAdminController.listFinanceUsers);
router.post("/", financeAdminController.createFinanceUser);
router.patch("/:id", financeAdminController.updateFinanceUser);
router.post("/:id/reset-password", financeAdminController.resetFinanceUserPassword);

module.exports = router;
