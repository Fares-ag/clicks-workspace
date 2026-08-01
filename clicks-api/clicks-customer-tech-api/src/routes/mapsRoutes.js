const express = require("express");
const router = express.Router();
const mapsController = require("../controllers/mapsController");
const { authenticate } = require("../middleware/auth");

router.get(
  "/directions",
  authenticate(["technician", "customer"]),
  mapsController.getDirections
);
router.get(
  "/geocode",
  authenticate(["technician", "customer"]),
  mapsController.geocode
);

module.exports = router;
