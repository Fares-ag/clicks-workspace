const mongoose = require("mongoose");

const CustomerSchema = new mongoose.Schema(
  {
    client_id: { type: String, unique: true, sparse: true },
    phone_number: { type: String, required: true, unique: true },
    first_name: { type: String, required: true, minlength: 2, maxlength: 50 },
    last_name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, minlength: 8 },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    fcm_token: { type: String },
    deletion_request: {
      reason: { type: String },
      other_reason: { type: String },
      requested_at: { type: Date }
    }
  },
  { timestamps: true }
);

// Pre-save hook to generate client_id
CustomerSchema.pre('save', async function(next) {
  if (!this.client_id && this.isNew) {
    try {
      // Find the highest client_id number
      const lastCustomer = await this.constructor.findOne(
        { client_id: { $regex: /^OC-\d{3}$/ } },
        { client_id: 1 }
      ).sort({ client_id: -1 });

      let nextNumber = 1;
      if (lastCustomer && lastCustomer.client_id) {
        const lastNumber = parseInt(lastCustomer.client_id.split('-')[1]);
        nextNumber = lastNumber + 1;
      }

      // Format as OC-XXX (pad with zeros to 3 digits)
      this.client_id = `OC-${String(nextNumber).padStart(3, '0')}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

module.exports = mongoose.model("Customer", CustomerSchema);
