import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useImportJobsMutation } from "../store/jobApi";
import { normalizeLocationString } from "../pages/HeatMap/jobHeatmapUtils";
import "./ImportJobsModal.css";

function mapStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  if (s === "F" || s === "FF") return "completed";
  if (s === "C") return "cancelled";
  if (s === "A") return "accepted";
  if (s === "S") return "in_progress";
  return "pending";
}

function mapJobType(issue) {
  const i = String(issue || "").trim().toLowerCase();
  if (i === "tire repair") return "Tires";
  if (i === "change tire") return "tire_change";
  if (i === "lock door" || i === "key") return "keyless_car_opening";
  if (i === "gear" || i.includes("gearbox")) return "Gearbox";
  return "Engines";
}

function previewMapRow(row) {
  return {
    legacy_id: row.id ?? "—",
    clientName: String(row.cname ?? "").trim() || "—",
    phone: String(row.cphone ?? "").trim() || "—",
    issue: String(row.issue ?? "").trim() || "—",
    jobType: mapJobType(row.issue),
    job_status: mapStatus(row.status),
    price: row.total != null ? Number(row.total) : 0,
    techName: String(row.techname ?? "").trim() || "—",
    location: normalizeLocationString(row.clocation) || "—",
  };
}

function ImportJobsModal({ open, onClose, onSuccess }) {
  const [importJobs, { isLoading }] = useImportJobsMutation();
  const [file, setFile] = useState(null);
  const [totalRows, setTotalRows] = useState(0);
  const [previewRows, setPreviewRows] = useState([]);
  const [parseError, setParseError] = useState("");
  const [result, setResult] = useState(null);
  const [apiError, setApiError] = useState("");

  const reset = () => {
    setFile(null);
    setTotalRows(0);
    setPreviewRows([]);
    setParseError("");
    setResult(null);
    setApiError("");
  };

  const handleClose = () => {
    if (isLoading) return;
    reset();
    onClose();
  };

  const handleFileChange = async (e) => {
    const selected = e.target.files?.[0];
    setResult(null);
    setApiError("");
    setParseError("");
    setPreviewRows([]);
    setTotalRows(0);
    setFile(null);

    if (!selected) return;

    const name = selected.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
      setParseError("Please select an Excel file (.xlsx)");
      return;
    }

    try {
      const buffer = await selected.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setParseError("Excel file has no sheets");
        return;
      }
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
      setFile(selected);
      setTotalRows(rows.length);
      setPreviewRows(rows.slice(0, 10).map(previewMapRow));
    } catch (err) {
      console.error(err);
      setParseError(err.message || "Failed to parse Excel file");
    }
  };

  const canImport = Boolean(file) && totalRows > 0 && !isLoading;

  const handleImport = async () => {
    if (!file) return;
    setApiError("");
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await importJobs(formData).unwrap();
      setResult(data);
      onSuccess?.(data);
    } catch (err) {
      console.error(err);
      setApiError(err?.data?.message || err?.error || "Import failed");
    }
  };

  const summaryText = useMemo(() => {
    if (!result) return "";
    return `Imported ${result.imported ?? 0}, skipped ${result.skipped ?? 0}, errors ${result.errorCount ?? result.errors?.length ?? 0}`;
  }, [result]);

  if (!open) return null;

  return (
    <div className="import-jobs-modal-backdrop">
      <div className="import-jobs-modal" role="dialog" aria-labelledby="import-jobs-title">
        <button
          className="import-jobs-modal-close"
          onClick={handleClose}
          aria-label="Close"
          disabled={isLoading}
        >
          <span>&#10005;</span>
        </button>

        <div className="import-jobs-modal-header">
          <h2 id="import-jobs-title">Import Historical Jobs</h2>
          <p>
            Upload the legacy Excel export. Matching technicians are linked by first name.
            Rows with an existing legacy job id are skipped.
          </p>
        </div>

        <label className="import-jobs-file-label">
          <input
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileChange}
            disabled={isLoading}
          />
          <span className="import-jobs-file-btn">
            {file ? "Change file" : "Choose Excel file"}
          </span>
          <span className="import-jobs-file-name">
            {file ? `${file.name} (${totalRows.toLocaleString()} rows)` : "No file selected"}
          </span>
        </label>

        {parseError && <div className="import-jobs-error">{parseError}</div>}
        {apiError && <div className="import-jobs-error">{apiError}</div>}

        {previewRows.length > 0 && !result && (
          <div className="import-jobs-preview">
            <div className="import-jobs-preview-title">
              Preview (first {previewRows.length} of {totalRows.toLocaleString()})
            </div>
            <div className="import-jobs-table-wrap">
              <table className="import-jobs-table">
                <thead>
                  <tr>
                    <th>Legacy ID</th>
                    <th>Client</th>
                    <th>Phone</th>
                    <th>Issue</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Price</th>
                    <th>Tech</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => (
                    <tr key={`${row.legacy_id}-${idx}`}>
                      <td>{row.legacy_id}</td>
                      <td>{row.clientName}</td>
                      <td>{row.phone}</td>
                      <td>{row.issue}</td>
                      <td>{row.jobType}</td>
                      <td>{row.job_status}</td>
                      <td>{row.price}</td>
                      <td>{row.techName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {result && (
          <div className="import-jobs-result">
            <div className="import-jobs-result-title">Import complete</div>
            <div className="import-jobs-result-summary">{summaryText}</div>
            {Array.isArray(result.errors) && result.errors.length > 0 && (
              <div className="import-jobs-errors-list">
                <div>Sample errors:</div>
                <ul>
                  {result.errors.slice(0, 10).map((err, idx) => (
                    <li key={idx}>
                      Row {err.row ?? "?"} (id {err.legacy_id ?? "?"}): {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="import-jobs-actions">
          <button
            type="button"
            className="import-jobs-cancel"
            onClick={handleClose}
            disabled={isLoading}
          >
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button
              type="button"
              className="import-jobs-confirm"
              onClick={handleImport}
              disabled={!canImport}
            >
              {isLoading ? "Importing…" : "Start Import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImportJobsModal;
