const {
  getOverview,
  getIssues,
  getVehicles,
  getCustomers,
  getServices,
  getSources,
  getTime,
  getLocations,
  getCrosstabs,
  getJobs,
  getCatalogs,
} = require("../services/dataAnalysisService");
const {
  listQuality,
  previewQuality,
  applyQuality,
  addAlias,
} = require("../services/dataAnalysisQuality");
const { rowsToCsv } = require("../services/dataAnalysisFilters");

function handle(fn) {
  return async (req, res) => {
    try {
      const data = await fn(req);
      res.json(data);
    } catch (err) {
      const status = err.status || 500;
      res.status(status).json({ message: err.message || "Data analysis failed" });
    }
  };
}

const overview = handle((req) => getOverview(req.query));
const issues = handle((req) => getIssues(req.query));
const vehicles = handle((req) => getVehicles(req.query));
const customers = handle((req) => getCustomers(req.query));
const services = handle((req) => getServices(req.query));
const sources = handle((req) => getSources(req.query));
const time = handle((req) => getTime(req.query));
const locations = handle((req) => getLocations(req.query));
const crosstabs = handle((req) => getCrosstabs(req.query));
const jobs = handle((req) => getJobs(req.query));
const catalogs = handle(() => getCatalogs());
const quality = handle((req) => listQuality(req.query));
const qualityPreview = handle((req) => previewQuality(req.body || {}, req.query));
const qualityApply = handle((req) => applyQuality(req));
const qualityAlias = handle((req) => addAlias(req));

async function exportDataset(req, res) {
  try {
    const dataset = String(req.query.dataset || "issues");
    let headers = [];
    let rows = [];
    if (dataset === "issues") {
      const data = await getIssues(req.query);
      headers = ["label", "jobType", "count", "revenue", "percentage", "topMake", "topArea"];
      rows = data.items || [];
    } else if (dataset === "vehicles") {
      const data = await getVehicles(req.query);
      headers = ["make", "model", "count", "revenue", "topIssue"];
      rows = data.models || [];
    } else if (dataset === "customers") {
      const data = await getCustomers({ ...req.query, page: 1, limit: 100 });
      headers = ["displayName", "phoneKey", "jobs", "revenue", "topIssue", "topMake", "nameVariantCount"];
      rows = data.items || [];
    } else if (dataset === "services") {
      const data = await getServices(req.query);
      headers = ["jobType", "count", "revenue"];
      rows = data.items || [];
    } else if (dataset === "sources") {
      const data = await getSources(req.query);
      headers = ["name", "count", "revenue", "topIssue"];
      rows = data.items || [];
    } else if (dataset === "locations") {
      const data = await getLocations(req.query);
      headers = ["areaLabel", "count", "revenue", "method"];
      rows = data.items || [];
    } else if (dataset === "jobs") {
      const data = await getJobs({ ...req.query, page: 1, limit: 100 });
      headers = [
        "jobReference",
        "dateTime",
        "clientName",
        "rawIssue",
        "canonicalIssue",
        "rawVehicle",
        "canonicalVehicle",
        "canonicalJobType",
        "price",
      ];
      rows = data.items || [];
    } else {
      return res.status(400).json({ message: "Unknown dataset" });
    }
    const csv = rowsToCsv(headers, rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=data-analysis-${dataset}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "Export failed" });
  }
}

module.exports = {
  overview,
  issues,
  vehicles,
  customers,
  services,
  sources,
  time,
  locations,
  crosstabs,
  jobs,
  catalogs,
  quality,
  qualityPreview,
  qualityApply,
  qualityAlias,
  exportDataset,
};
