const mongoose = require("mongoose");

const IssueAliasSchema = new mongoose.Schema(
  {
    field: {
      type: String,
      enum: ["issue", "vehicle", "area"],
      required: true,
      index: true,
    },
    alias: { type: String, required: true, trim: true },
    canonicalIssueId: { type: String, default: "" },
    canonicalMake: { type: String, default: "" },
    canonicalModel: { type: String, default: "" },
    areaId: { type: String, default: "" },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

IssueAliasSchema.index({ field: 1, alias: 1 }, { unique: true });

module.exports = mongoose.model("IssueAlias", IssueAliasSchema);
