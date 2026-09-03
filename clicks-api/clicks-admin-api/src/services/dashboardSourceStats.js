const Job = require("clicks-shared/models/Job");
const { isHiddenSourceName } = require("clicks-shared/utils/systemSources");

async function getTopJobSources(limit = 5) {
  const rows = await Job.aggregate([
    { $group: { _id: "$source", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "sources",
        localField: "_id",
        foreignField: "_id",
        as: "sourceDoc",
      },
    },
    {
      $project: {
        sourceId: "$_id",
        name: {
          $ifNull: [
            { $arrayElemAt: ["$sourceDoc.mainSourceName", 0] },
            "Unknown",
          ],
        },
        count: 1,
      },
    },
  ]);

  return rows
    .filter((row) => !isHiddenSourceName(row.name))
    .map((row) => ({
      sourceId: row.sourceId,
      name: row.name,
      count: row.count,
    }));
}

async function getTopJobSubSources(limit = 5) {
  const rows = await Job.aggregate([
    {
      $addFields: {
        effectiveSubSource: {
          $let: {
            vars: {
              rawSub: { $trim: { input: { $ifNull: ["$subSource", ""] } } },
              techName: { $trim: { input: { $ifNull: ["$createdByTechnicianName", ""] } } },
              bizName: { $trim: { input: { $ifNull: ["$businessName", ""] } } },
            },
            in: {
              $cond: [
                { $ne: ["$$techName", ""] },
                "$$techName",
                { $cond: [{ $ne: ["$$bizName", ""] }, "$$bizName", "$$rawSub"] },
              ],
            },
          },
        },
      },
    },
    { $match: { effectiveSubSource: { $ne: "" } } },
    {
      $group: {
        _id: { subSource: "$effectiveSubSource", source: "$source" },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "sources",
        localField: "_id.source",
        foreignField: "_id",
        as: "sourceDoc",
      },
    },
    {
      $project: {
        subSource: "$_id.subSource",
        sourceId: "$_id.source",
        sourceName: {
          $ifNull: [
            { $arrayElemAt: ["$sourceDoc.mainSourceName", 0] },
            "Unknown",
          ],
        },
        count: 1,
      },
    },
  ]);

  return rows
    .filter((row) => !isHiddenSourceName(row.sourceName))
    .map((row) => ({
      subSource: row.subSource,
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      name: row.subSource,
      count: row.count,
    }));
}

module.exports = { getTopJobSources, getTopJobSubSources };
