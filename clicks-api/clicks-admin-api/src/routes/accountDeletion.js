const express = require("express");
const { createPublicRequest } = require("../controllers/accountDeletionController");

const router = express.Router();

router.post("/public", createPublicRequest);

module.exports = router;
