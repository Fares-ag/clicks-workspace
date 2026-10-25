import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useGetSourcesQuery } from "../../store/sourceApi";
import {
  useGetAnalysisOverviewQuery,
  useGetAnalysisIssuesQuery,
  useGetAnalysisVehiclesQuery,
  useGetAnalysisCustomersQuery,
  useGetAnalysisServicesQuery,
  useGetAnalysisSourcesQuery,
  useGetAnalysisTimeQuery,
  useGetAnalysisLocationsQuery,
  useGetAnalysisCrosstabsQuery,
  useGetAnalysisJobsQuery,
  useGetAnalysisCatalogsQuery,
  useGetAnalysisQualityQuery,
  usePreviewAnalysisQualityMutation,
  useApplyAnalysisQualityMutation,
  useAddAnalysisAliasMutation,
  useLazyExportAnalysisQuery,
} from "../../store/dataAnalysisApi";
import { isHiddenSourceName } from "../../utils/systemSources";
import "./DataAnalysis.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "issues", label: "Issues" },
  { id: "vehicles", label: "Vehicles" },
  { id: "customers", label: "Customers" },
  { id: "services", label: "Services" },
  { id: "sources", label: "Sources & time" },
  { id: "locations", label: "Locations" },
  { id: "quality", label: "Data quality" },
  { id: "jobs", label: "Jobs" },
];

const DATE_PRESETS = [
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "12m", label: "12 months", days: 365 },
  { id: "all", label: "All time", days: null },
];

function toYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeFromPreset(preset) {
  if (preset === "all") return { from: "", to: "" };
  const days = DATE_PRESETS.find((row) => row.id === preset)?.days || 365;
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - days);
  return { from: toYmd(from), to: toYmd(to) };
}

function money(value) {
  return `QAR ${Number(value || 0).toLocaleString()}`;
}

function maxCount(rows, key = "count") {
  return Math.max(1, ...rows.map((row) => Number(row[key]) || 0));
}

function Confidence({ value }) {
  const score = Number(value) || 0;
  const cls = score >= 0.85 ? "high" : score < 0.6 ? "low" : "";
  return <span className={`data-analysis-confidence ${cls}`}>{Math.round(score * 100)}%</span>;
}

function SimpleTable({ columns, rows, empty = "No rows for this filter." }) {
  if (!rows?.length) return <div className="data-analysis-empty">{empty}</div>;
  return (
    <table className="data-analysis-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.title}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.id || row.key || index}>
            {columns.map((col) => (
              <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DataAnalysis() {
  const [tab, setTab] = useState("overview");
  const [preset, setPreset] = useState("12m");
  const [jobStatus, setJobStatus] = useState("completed");
  const [sourceId, setSourceId] = useState("");
  const [view, setView] = useState("canonical");
  const [excludeHistorical, setExcludeHistorical] = useState(true);
  const [canonicalIssueId, setCanonicalIssueId] = useState("");
  const [canonicalMake, setCanonicalMake] = useState("");
  const [qualityField, setQualityField] = useState("issue");
  const [expanded, setExpanded] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(null);
  const [aliasDraft, setAliasDraft] = useState({ alias: "", canonicalIssueId: "" });

  const filters = useMemo(() => {
    const range = rangeFromPreset(preset);
    return {
      ...range,
      jobStatus,
      sourceId,
      view,
      excludeHistoricalImport: excludeHistorical,
      canonicalIssueId,
      canonicalMake,
    };
  }, [preset, jobStatus, sourceId, view, excludeHistorical, canonicalIssueId, canonicalMake]);

  const { data: sourceData } = useGetSourcesQuery();
  const sources = (sourceData?.sources || []).filter(
    (row) => row && !isHiddenSourceName(row.mainSourceName)
  );
  const { data: catalogs } = useGetAnalysisCatalogsQuery();

  const overview = useGetAnalysisOverviewQuery(filters, { skip: tab !== "overview" && tab !== "issues" });
  const issues = useGetAnalysisIssuesQuery(filters, { skip: tab !== "issues" && tab !== "overview" });
  const vehicles = useGetAnalysisVehiclesQuery(filters, { skip: tab !== "vehicles" });
  const customers = useGetAnalysisCustomersQuery(
    { ...filters, page, limit: 20 },
    { skip: tab !== "customers" }
  );
  const services = useGetAnalysisServicesQuery(filters, { skip: tab !== "services" });
  const sourcesMix = useGetAnalysisSourcesQuery(filters, { skip: tab !== "sources" });
  const time = useGetAnalysisTimeQuery(filters, { skip: tab !== "sources" });
  const locations = useGetAnalysisLocationsQuery(filters, { skip: tab !== "locations" });
  const crosstabs = useGetAnalysisCrosstabsQuery(
    { ...filters, rows: "issue", cols: "make" },
    { skip: tab !== "issues" }
  );
  const jobs = useGetAnalysisJobsQuery({ ...filters, page, limit: 20 }, { skip: tab !== "jobs" });
  const quality = useGetAnalysisQualityQuery(
    { ...filters, field: qualityField, page, limit: 20 },
    { skip: tab !== "quality" }
  );

  const [previewQuality] = usePreviewAnalysisQualityMutation();
  const [applyQuality, { isLoading: applying }] = useApplyAnalysisQualityMutation();
  const [addAlias, { isLoading: aliasing }] = useAddAnalysisAliasMutation();
  const [exportCsv] = useLazyExportAnalysisQuery();

  const download = async (dataset) => {
    const csv = await exportCsv({ ...filters, dataset }).unwrap();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `data-analysis-${dataset}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openPreview = async (row) => {
    const result = await previewQuality({
      ...filters,
      field: qualityField,
      raw: row.raw,
      canonical: row.suggested,
    }).unwrap();
    setPreview({ row, result });
  };

  const confirmApply = async () => {
    if (!preview) return;
    await applyQuality({
      ...filters,
      field: qualityField,
      raw: preview.row.raw,
      canonical: preview.row.suggested,
      alsoUpdateLeads: true,
      matchedCount: preview.result.matchedCount,
    }).unwrap();
    setPreview(null);
  };

  const activeQuery = {
    overview,
    issues,
    vehicles,
    customers,
    services,
    sources: sourcesMix,
    locations,
    quality,
    jobs,
  }[tab === "sources" ? "sources" : tab];

  return (
    <div className="data-analysis-page">
      <div className="data-analysis-header">
        <div>
          <h1 className="data-analysis-title">Data Analysis</h1>
          <p className="data-analysis-subtitle">
            Cleaned customers, vehicles, issues, services, sources, and locations.
            Expand any row to see the original spellings behind the number.
          </p>
        </div>
        <div className="data-analysis-actions">
          <button type="button" onClick={() => download(tab === "overview" ? "issues" : tab)}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="data-analysis-banner">
        <span>
          Numbers use cleaned values by default. Toggle raw to see stored text, or open Data quality
          to approve fixes.
        </span>
        <button
          type="button"
          className={`data-analysis-chip ${view === "canonical" ? "active" : ""}`}
          onClick={() => setView(view === "canonical" ? "raw" : "canonical")}
        >
          {view === "canonical" ? "Canonical" : "Raw"}
        </button>
      </div>

      <div className="data-analysis-filters">
        {DATE_PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`data-analysis-chip ${preset === item.id ? "active" : ""}`}
            onClick={() => {
              setPreset(item.id);
              setPage(1);
            }}
          >
            {item.label}
          </button>
        ))}
        <select value={jobStatus} onChange={(e) => setJobStatus(e.target.value)}>
          <option value="completed">Completed</option>
          <option value="all">All statuses</option>
        </select>
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="">All sources</option>
          {sources.map((row) => (
            <option key={row._id} value={row._id}>
              {row.mainSourceName}
            </option>
          ))}
        </select>
        <select
          value={canonicalIssueId}
          onChange={(e) => setCanonicalIssueId(e.target.value)}
        >
          <option value="">All issues</option>
          {(catalogs?.issues || []).map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={excludeHistorical}
            onChange={(e) => setExcludeHistorical(e.target.checked)}
          />{" "}
          Hide historical import
        </label>
      </div>

      <div className="data-analysis-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`data-analysis-tab ${tab === item.id ? "active" : ""}`}
            onClick={() => {
              setTab(item.id);
              setPage(1);
              setExpanded("");
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeQuery?.isError && (
        <div className="data-analysis-error">
          {activeQuery.error?.data?.message || "Failed to load data analysis."}
        </div>
      )}
      {activeQuery?.isLoading && <div className="data-analysis-empty">Loading cleaned data…</div>}

      {tab === "overview" && overview.data && (
        <>
          <div className="data-analysis-kpis">
            {[
              ["Jobs", overview.data.jobs],
              ["Revenue", money(overview.data.revenue)],
              ["Avg ticket", money(overview.data.avgTicket)],
              ["Customers", overview.data.uniqueCustomers],
              ["Repeat rate", `${overview.data.repeatRate}%`],
            ].map(([label, value]) => (
              <div key={label} className="data-analysis-kpi">
                <div className="data-analysis-kpi-label">{label}</div>
                <div className="data-analysis-kpi-value">{value}</div>
              </div>
            ))}
          </div>
          <div className="data-analysis-coverage">
            {Object.entries(overview.data.coverage || {}).map(([key, value]) => (
              <div key={key} className="data-analysis-coverage-item">
                <strong>{value}%</strong> {key.replace(/([A-Z])/g, " $1").toLowerCase()}
              </div>
            ))}
          </div>
          <div className="data-analysis-card">
            <h2>Top issues</h2>
            <SimpleTable
              rows={overview.data.topIssues || []}
              columns={[
                { key: "label", title: "Issue" },
                { key: "count", title: "Jobs" },
                { key: "jobType", title: "Type" },
              ]}
            />
          </div>
        </>
      )}

      {tab === "issues" && issues.data && (
        <div className="data-analysis-card">
          <h2>Issues</h2>
          <SimpleTable
            rows={issues.data.items || []}
            columns={[
              {
                key: "label",
                title: "Canonical issue",
                render: (row) => (
                  <div>
                    <button
                      type="button"
                      className="data-analysis-link"
                      onClick={() => setExpanded(expanded === row.id ? "" : row.id)}
                    >
                      {row.label}
                    </button>
                    {expanded === row.id && (
                      <div className="data-analysis-raw">
                        {(row.rawValues || []).map((raw) => (
                          <div key={raw.raw}>
                            {raw.raw || "(blank)"} — {raw.count}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              },
              { key: "jobType", title: "Job type" },
              { key: "count", title: "Jobs" },
              {
                key: "revenue",
                title: "Revenue",
                render: (row) => money(row.revenue),
              },
              { key: "percentage", title: "%" },
              { key: "topMake", title: "Top make" },
              { key: "topArea", title: "Top area" },
              {
                key: "open",
                title: "",
                render: (row) => (
                  <button
                    type="button"
                    className="data-analysis-link"
                    onClick={() => {
                      setCanonicalIssueId(row.id);
                      setTab("jobs");
                    }}
                  >
                    View jobs
                  </button>
                ),
              },
            ]}
          />
          <h2 style={{ marginTop: 24 }}>Issue × make</h2>
          <SimpleTable
            rows={(crosstabs.data?.cells || []).slice(0, 20)}
            columns={[
              {
                key: "row",
                title: "Issue",
                render: (row) =>
                  crosstabs.data?.rows?.find((item) => item.key === row.rowKey)?.label || row.rowKey,
              },
              {
                key: "col",
                title: "Make",
                render: (row) =>
                  crosstabs.data?.cols?.find((item) => item.key === row.colKey)?.label || row.colKey,
              },
              { key: "count", title: "Jobs" },
            ]}
          />
        </div>
      )}

      {tab === "vehicles" && vehicles.data && (
        <div className="data-analysis-card">
          <h2>Makes</h2>
          <SimpleTable
            rows={vehicles.data.makes || []}
            columns={[
              { key: "make", title: "Make" },
              { key: "count", title: "Jobs" },
              { key: "revenue", title: "Revenue", render: (row) => money(row.revenue) },
            ]}
          />
          <h2 style={{ marginTop: 24 }}>Models</h2>
          <SimpleTable
            rows={vehicles.data.models || []}
            columns={[
              { key: "make", title: "Make" },
              { key: "model", title: "Model" },
              { key: "count", title: "Jobs" },
              { key: "topIssue", title: "Top issue" },
              {
                key: "raw",
                title: "Raw spellings",
                render: (row) =>
                  (row.rawValues || [])
                    .map((item) => item.raw)
                    .filter(Boolean)
                    .slice(0, 4)
                    .join(" · "),
              },
            ]}
          />
        </div>
      )}

      {tab === "customers" && customers.data && (
        <div className="data-analysis-card">
          <h2>Repeat customers</h2>
          <SimpleTable
            rows={customers.data.items || []}
            columns={[
              { key: "displayName", title: "Name" },
              { key: "phoneKey", title: "Phone key" },
              { key: "jobs", title: "Jobs" },
              { key: "revenue", title: "Revenue", render: (row) => money(row.revenue) },
              { key: "topIssue", title: "Top issue" },
              { key: "topMake", title: "Car" },
              { key: "nameVariantCount", title: "Name variants" },
            ]}
          />
          <div className="data-analysis-actions" style={{ marginTop: 12 }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>
              Page {customers.data.page} of{" "}
              {Math.max(1, Math.ceil((customers.data.total || 0) / (customers.data.limit || 20)))}
            </span>
            <button
              type="button"
              disabled={page * (customers.data.limit || 20) >= (customers.data.total || 0)}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {tab === "services" && services.data && (
        <div className="data-analysis-card">
          <h2>Services</h2>
          <SimpleTable
            rows={services.data.items || []}
            columns={[
              { key: "jobType", title: "Job type" },
              { key: "count", title: "Jobs" },
              { key: "revenue", title: "Revenue", render: (row) => money(row.revenue) },
              {
                key: "issues",
                title: "Nested issues",
                render: (row) =>
                  (row.issues || [])
                    .map((item) => `${item.label} (${item.count})`)
                    .join(" · "),
              },
            ]}
          />
        </div>
      )}

      {tab === "sources" && (
        <>
          <div className="data-analysis-card">
            <h2>Sources</h2>
            <SimpleTable
              rows={sourcesMix.data?.items || []}
              columns={[
                { key: "name", title: "Source" },
                { key: "count", title: "Jobs" },
                { key: "revenue", title: "Revenue", render: (row) => money(row.revenue) },
                { key: "topIssue", title: "Top issue" },
              ]}
            />
          </div>
          <div className="data-analysis-card">
            <h2>Hour of day (Qatar)</h2>
            <SimpleTable
              rows={time.data?.hours || []}
              columns={[
                { key: "hour", title: "Hour" },
                { key: "count", title: "Jobs" },
                {
                  key: "bar",
                  title: "",
                  render: (row) => (
                    <div className="data-analysis-bar">
                      <span
                        style={{
                          width: `${(row.count / maxCount(time.data?.hours || [])) * 100}%`,
                        }}
                      />
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </>
      )}

      {tab === "locations" && locations.data && (
        <div className="data-analysis-card">
          <h2>Areas</h2>
          <SimpleTable
            rows={locations.data.items || []}
            columns={[
              { key: "areaLabel", title: "Area" },
              { key: "count", title: "Jobs" },
              { key: "method", title: "Match" },
            ]}
          />
        </div>
      )}

      {tab === "quality" && quality.data && (
        <div className="data-analysis-card">
          <div className="data-analysis-filters">
            <select
              value={qualityField}
              onChange={(e) => {
                setQualityField(e.target.value);
                setPage(1);
              }}
            >
              {["issue", "vehicle", "jobType", "customerName", "location", "plate"].map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </div>
          <SimpleTable
            rows={quality.data.items || []}
            empty="No dirty clusters for this field."
            columns={[
              {
                key: "raw",
                title: "Raw",
                render: (row) => JSON.stringify(row.raw),
              },
              {
                key: "suggested",
                title: "Suggested",
                render: (row) =>
                  row.suggested.issue ||
                  [row.suggested.vehicleMake, row.suggested.vehicleModel].filter(Boolean).join(" ") ||
                  row.suggested.jobType ||
                  row.suggested.clientName ||
                  row.suggested.areaLabel ||
                  row.suggested.licensePlate ||
                  "—",
              },
              {
                key: "confidence",
                title: "Confidence",
                render: (row) => <Confidence value={row.confidence} />,
              },
              { key: "jobCount", title: "Jobs" },
              {
                key: "act",
                title: "",
                render: (row) => (
                  <button type="button" className="data-analysis-link" onClick={() => openPreview(row)}>
                    Preview
                  </button>
                ),
              },
            ]}
          />
          <h2 style={{ marginTop: 24 }}>Add issue alias</h2>
          <div className="data-analysis-filters">
            <input
              placeholder="Alias (EN or Arabic)"
              value={aliasDraft.alias}
              onChange={(e) => setAliasDraft({ ...aliasDraft, alias: e.target.value })}
            />
            <select
              value={aliasDraft.canonicalIssueId}
              onChange={(e) => setAliasDraft({ ...aliasDraft, canonicalIssueId: e.target.value })}
            >
              <option value="">Canonical issue</option>
              {(catalogs?.issues || []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={aliasing || !aliasDraft.alias || !aliasDraft.canonicalIssueId}
              onClick={() =>
                addAlias({
                  field: "issue",
                  alias: aliasDraft.alias,
                  canonicalIssueId: aliasDraft.canonicalIssueId,
                })
              }
            >
              Save alias
            </button>
          </div>
        </div>
      )}

      {tab === "jobs" && jobs.data && (
        <div className="data-analysis-card">
          <h2>Jobs behind this filter</h2>
          <SimpleTable
            rows={jobs.data.items || []}
            columns={[
              {
                key: "jobReference",
                title: "Job",
                render: (row) => <Link to={`/jobs/${row.id}`}>{row.jobReference || row.id.slice(-6)}</Link>,
              },
              { key: "clientName", title: "Customer" },
              { key: "rawIssue", title: "Raw issue" },
              { key: "canonicalIssue", title: "Cleaned issue" },
              { key: "rawVehicle", title: "Raw vehicle" },
              { key: "canonicalVehicle", title: "Cleaned vehicle" },
              { key: "price", title: "Price", render: (row) => money(row.price) },
            ]}
          />
        </div>
      )}

      {preview && (
        <div className="data-analysis-modal-backdrop" onClick={() => setPreview(null)}>
          <div className="data-analysis-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Preview apply</h3>
            <p>
              {preview.result.matchedCount} jobs match this raw value.
              {preview.result.error ? ` ${preview.result.error}` : ""}
            </p>
            <pre className="data-analysis-raw">
              {JSON.stringify(preview.result.wouldChange || preview.row.suggested, null, 2)}
            </pre>
            <div className="data-analysis-actions">
              <button type="button" onClick={() => setPreview(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={applying || Boolean(preview.result.error)}
                onClick={confirmApply}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataAnalysis;
