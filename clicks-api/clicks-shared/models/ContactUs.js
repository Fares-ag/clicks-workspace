const mongoose = require("mongoose");

const ContactUsSchema = new mongoose.Schema(
  {
    customer_id: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Customer", 
      required: true 
    },
    issue: { 
      type: String, 
      required: true 
    },
    description: { 
      type: String, 
      required: true 
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "resolved"],
      default: "pending"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContactUs", ContactUsSchema);
