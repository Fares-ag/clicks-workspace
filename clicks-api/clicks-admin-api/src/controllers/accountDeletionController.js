const { AccountDeletionRequest } = require("../../../clicks-shared/models");

async function createPublicRequest(req, res) {
  try {
    const { name, email, phone, note, appName } = req.body;

    if (!name?.trim() || !phone?.trim()) {
      return res.status(400).json({
        error: "Name and registered phone number are required",
      });
    }

    const request = await AccountDeletionRequest.create({
      appName: appName?.trim() || "Sanad Technician",
      name: name.trim(),
      email: email?.trim() || "",
      phone: phone.trim(),
      note: note?.trim() || "",
    });

    res.status(201).json({
      message: "Account deletion request submitted",
      id: request._id,
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to submit account deletion request",
      details: err.message,
    });
  }
}

module.exports = {
  createPublicRequest,
};
