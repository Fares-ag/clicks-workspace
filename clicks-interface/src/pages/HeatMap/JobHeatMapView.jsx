import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
} from "@react-google-maps/api";
import { Link } from "react-router-dom";
import {
  useLazyGetJobHeatmapQuery,
  useLazyGetJobsNearbyQuery,
} from "../../store/jobApi";
import DatePicker from "../../components/DatePicker";
import JobHeatmapCanvasLayer from "./JobHeatmapCanvasLayer";
import {
  MAP_CENTER,
  MAP_ZOOM,
  JOB_STATUSES,
  JOB_TYPES,
  DATE_PRESETS,
  TIME_PRESETS,
  RADIUS_OPTIONS,
  HEAT_CONCENTRATION_LEVELS,
  resolveDateRange,
  resolveTimeRange,
  formatShortDate,
  formatTimeRangeLabel,
  formatStatsDateSpan,
  findNearestDot,
  dotPickRadiusMeters,
  mapOptions,
} from "./jobHeatmapUtils";
import {
  GOOGLE_MAPS_API_KEY,
  googleMapsLoaderOptions,
} from "../../config/googleMapsLoader";

const mapContainerStyle = { width: "100%", height: "100%" };
const HEATMAP_FETCH_DEBOUNCE_MS = 400;

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function viewportQueryKey(viewport) {
  if (!viewport) return "";
  const round = (n, p) => Number(n.toFixed(p));
  return [
    round(viewport.north, 3),
    round(viewport.south, 3),
    round(viewport.east, 3),
    round(viewport.west, 3),
    viewport.zoom,
  ].join("|");
}

function JobHeatMapView() {
  const mapRef = useRef(null);
  const [datePreset, setDatePreset] = useState("all");
  const [customFrom, setCustomFrom] = useState(null);
  const [customTo, setCustomTo] = useState(null);
  const [timePreset, setTimePreset] = useState("all");
  const [customFromTime, setCustomFromTime] = useState("08:00");
  const [customToTime, setCustomToTime] = useState("18:00");
  const [fromPickerOpen, setFromPickerOpen] = useState(false);
  const [toPickerOpen, setToPickerOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [jobType, setJobType] = useState("");
  const [radiusKm, setRadiusKm] = useState(1);
  const [clickCenter, setClickCenter] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [mapViewport, setMapViewport] = useState(null);
  const debouncedViewport = useDebouncedValue(
    mapViewport,
    HEATMAP_FETCH_DEBOUNCE_MS
  );
  const lastFetchKeyRef = useRef("");

  const dateRange = useMemo(
    () => resolveDateRange(datePreset, customFrom, customTo),
    [datePreset, customFrom, customTo]
  );

  const timeRange = useMemo(
    () => resolveTimeRange(timePreset, customFromTime, customToTime),
    [timePreset, customFromTime, customToTime]
  );

  const filterQuery = useMemo(
    () => ({
      ...dateRange,
      ...timeRange,
      status: status || undefined,
      jobType: jobType || undefined,
    }),
    [dateRange, timeRange, status, jobType]
  );

  const [fetchHeatmap, heatmapState] = useLazyGetJobHeatmapQuery();

  useEffect(() => {
    if (!debouncedViewport) return;
    const key = `${viewportQueryKey(debouncedViewport)}|${JSON.stringify(filterQuery)}`;
    if (key === lastFetchKeyRef.current) return;
    lastFetchKeyRef.current = key;
    fetchHeatmap({ ...filterQuery, ...debouncedViewport });
  }, [fetchHeatmap, filterQuery, debouncedViewport]);

  const heatmapData = heatmapState.data;
  const isLoading = heatmapState.isLoading && !heatmapData;
  const isFetching = heatmapState.isFetching;
  const isError = heatmapState.isError;
  const error = heatmapState.error;

  const [fetchNearby, nearbyState] = useLazyGetJobsNearbyQuery();

  const mapsKeyMissing = !GOOGLE_MAPS_API_KEY.trim();
  const { isLoaded: mapsLoaded } = useJsApiLoader(googleMapsLoaderOptions);

  const heatPoints = useMemo(
    () => heatmapData?.points ?? [],
    [heatmapData?.points]
  );

  const dotPoints = useMemo(
    () => heatmapData?.dots ?? [],
    [heatmapData?.dots]
  );

  const stats = heatmapData?.stats;
  const hotspots = heatmapData?.hotspots || [];

  const loadNearby = useCallback(
    (lat, lng, radius = radiusKm, clearSelected = true) => {
      if (clearSelected) setSelectedJob(null);
      setClickCenter({ lat, lng });
      setPanelOpen(true);
      fetchNearby({
        lat,
        lng,
        radiusKm: radius,
        ...dateRange,
        ...timeRange,
        status: status || undefined,
        jobType: jobType || undefined,
      });
    },
    [fetchNearby, radiusKm, dateRange, timeRange, status, jobType]
  );

  const selectJobDot = useCallback((job) => {
    setSelectedJob(job);
    setClickCenter({ lat: job.lat, lng: job.lng });
    setPanelOpen(true);
  }, []);

  const onMapClick = useCallback(
    (e) => {
      if (!e?.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      const zoom = mapRef.current?.getZoom() ?? MAP_ZOOM;
      const nearest = findNearestDot(
        dotPoints,
        lat,
        lng,
        dotPickRadiusMeters(zoom)
      );
      if (nearest?._id) {
        selectJobDot(nearest);
        return;
      }
      loadNearby(lat, lng);
    },
    [dotPoints, loadNearby, selectJobDot]
  );

  const onHotspotClick = useCallback(
    (spot) => {
      if (mapRef.current) {
        mapRef.current.panTo({ lat: spot.lat, lng: spot.lng });
        mapRef.current.setZoom(13);
      }
      loadNearby(spot.lat, spot.lng);
    },
    [loadNearby]
  );

  const onRadiusChange = (next) => {
    setRadiusKm(next);
    if (clickCenter) {
      loadNearby(clickCenter.lat, clickCenter.lng, next);
    }
  };

  const syncMapViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    setMapViewport({
      north: ne.lat(),
      south: sw.lat(),
      east: ne.lng(),
      west: sw.lng(),
      zoom: map.getZoom() ?? MAP_ZOOM,
    });
  }, []);

  const onMapIdle = useCallback(() => {
    syncMapViewport();
  }, [syncMapViewport]);

  const onMapLoad = useCallback(
    (map) => {
      mapRef.current = map;
      syncMapViewport();
    },
    [syncMapViewport]
  );

  const nearbyJobs = nearbyState.data?.jobs || [];
  const nearbyTotal = nearbyState.data?.total ?? 0;

  return (
    <>
      <div className="heat-map-toolbar">
        <div className="heat-map-presets">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`heat-map-chip${datePreset === p.id ? " active" : ""}`}
              onClick={() => setDatePreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {datePreset === "custom" && (
          <div className="heat-map-custom-dates">
            <div className="heat-map-date-field">
              <button
                type="button"
                className="heat-map-date-btn"
                onClick={() => {
                  setFromPickerOpen((v) => !v);
                  setToPickerOpen(false);
                }}
              >
                From: {customFrom ? formatShortDate(customFrom) : "Select"}
              </button>
              {fromPickerOpen && (
                <div className="heat-map-datepicker-pop">
                  <DatePicker
                    value={customFrom || new Date().toISOString()}
                    onChange={(iso) => {
                      setCustomFrom(iso);
                      setFromPickerOpen(false);
                    }}
                    onClose={() => setFromPickerOpen(false)}
                  />
                </div>
              )}
            </div>
            <div className="heat-map-date-field">
              <button
                type="button"
                className="heat-map-date-btn"
                onClick={() => {
                  setToPickerOpen((v) => !v);
                  setFromPickerOpen(false);
                }}
              >
                To: {customTo ? formatShortDate(customTo) : "Select"}
              </button>
              {toPickerOpen && (
                <div className="heat-map-datepicker-pop">
                  <DatePicker
                    value={customTo || new Date().toISOString()}
                    onChange={(iso) => {
                      setCustomTo(iso);
                      setToPickerOpen(false);
                    }}
                    onClose={() => setToPickerOpen(false)}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <select
          className="heat-map-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Job status"
        >
          {JOB_STATUSES.map((s) => (
            <option key={s.value || "all"} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <select
          className="heat-map-select"
          value={jobType}
          onChange={(e) => setJobType(e.target.value)}
          aria-label="Job type"
        >
          {JOB_TYPES.map((t) => (
            <option key={t.value || "all"} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="heat-map-toolbar heat-map-time-toolbar">
        <span className="heat-map-toolbar-label">Time of day</span>
        <div className="heat-map-presets">
          {TIME_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`heat-map-chip${timePreset === p.id ? " active" : ""}`}
              onClick={() => setTimePreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {timePreset === "custom" && (
          <div className="heat-map-custom-times">
            <input
              type="time"
              className="heat-map-time-input"
              value={customFromTime}
              onChange={(e) => setCustomFromTime(e.target.value)}
              aria-label="From time"
            />
            <span className="heat-map-time-sep">–</span>
            <input
              type="time"
              className="heat-map-time-input"
              value={customToTime}
              onChange={(e) => setCustomToTime(e.target.value)}
              aria-label="To time"
            />
          </div>
        )}
      </div>

      <div className="heat-map-stats">
        {isLoading && !heatmapData ? (
          <span>Loading heatmap…</span>
        ) : isFetching ? (
          <span>
            {(stats?.plotted ?? heatPoints.length).toLocaleString()} jobs
            {dotPoints.length > 0 && (
              <> · {dotPoints.length.toLocaleString()} in view</>
            )}
            {" · updating…"}
          </span>
        ) : isError ? (
          <span className="heat-map-stats-error">
            Failed to load heatmap
            {error?.data?.message ? `: ${error.data.message}` : ""}
          </span>
        ) : (
          <span>
            {(stats?.plotted ?? 0).toLocaleString()} jobs total
            {dotPoints.length > 0 && (
              <> · {dotPoints.length.toLocaleString()} jobs in view</>
            )}
            {(stats?.missingCoordinates ?? 0) > 0 && (
              <>
                {" "}
                · {(stats.missingCoordinates ?? 0).toLocaleString()} without
                coordinates
              </>
            )}
            {formatStatsDateSpan(stats) && (
              <> · {formatStatsDateSpan(stats)}</>
            )}
            {formatTimeRangeLabel(timeRange) && (
              <> · {formatTimeRangeLabel(timeRange)}</>
            )}
          </span>
        )}
      </div>

      {!isLoading && !isError && heatmapData && (
        <div className="heat-map-concentration-legend" aria-label="Job concentration legend">
          <span className="heat-map-concentration-title">Job concentration</span>
          <div className="heat-map-concentration-steps">
            {HEAT_CONCENTRATION_LEVELS.map((level) => (
              <div key={level.label} className="heat-map-concentration-step">
                <span
                  className="heat-map-concentration-swatch"
                  style={{
                    backgroundColor: level.cssVar
                      ? `var(${level.cssVar}, ${level.color})`
                      : level.color,
                  }}
                  aria-hidden
                />
                <span className="heat-map-concentration-label">{level.label}</span>
                <span className="heat-map-concentration-hint">{level.hint}</span>
              </div>
            ))}
          </div>
          <span className="heat-map-concentration-arrow">Few jobs → Hotspot</span>
        </div>
      )}

      <div className="heat-map-body">
        <div className="heat-map-frame-wrap">
          {mapsKeyMissing ? (
            <div className="heat-map-empty">
              Missing VITE_GOOGLE_MAPS_API_KEY — cannot render map.
            </div>
          ) : !mapsLoaded ? (
            <div className="heat-map-empty">Loading Google Maps…</div>
          ) : (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={MAP_CENTER}
              zoom={MAP_ZOOM}
              options={mapOptions}
              onLoad={onMapLoad}
              onIdle={onMapIdle}
              onClick={onMapClick}
            >
              {(heatPoints.length > 0 || dotPoints.length > 0) && (
                <JobHeatmapCanvasLayer
                  heatPoints={heatPoints}
                  dotPoints={dotPoints}
                />
              )}
              {clickCenter && (
                <Marker position={clickCenter} title="Selected area" />
              )}
            </GoogleMap>
          )}
        </div>

        <aside className={`heat-map-side${panelOpen ? " open" : ""}`}>
          <div className="heat-map-side-section">
            <h3 className="heat-map-side-title">Top hotspots</h3>
            {hotspots.length === 0 ? (
              <p className="heat-map-side-muted">No hotspot data yet.</p>
            ) : (
              <ul className="heat-map-hotspot-list">
                {hotspots.map((spot, i) => (
                  <li key={`${spot.lat}-${spot.lng}-${i}`}>
                    <button
                      type="button"
                      className="heat-map-hotspot-btn"
                      onClick={() => onHotspotClick(spot)}
                    >
                      <span className="heat-map-hotspot-rank">#{i + 1}</span>
                      <span>
                        {spot.count.toLocaleString()} jobs
                        <span className="heat-map-hotspot-coords">
                          {spot.lat.toFixed(3)}, {spot.lng.toFixed(3)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {panelOpen && (
            <div className="heat-map-side-section heat-map-drilldown">
              <div className="heat-map-drilldown-header">
                <h3 className="heat-map-side-title">
                  {selectedJob ? "Selected job" : "Jobs nearby"}
                </h3>
                <button
                  type="button"
                  className="heat-map-close-panel"
                  onClick={() => {
                    setPanelOpen(false);
                    setSelectedJob(null);
                  }}
                  aria-label="Close panel"
                >
                  ×
                </button>
              </div>

              {selectedJob && (
                <div className="heat-map-selected-job">
                  <div className="heat-map-job-card heat-map-job-card-selected">
                    <div className="heat-map-job-card-top">
                      <strong>{selectedJob.clientName || "Unknown"}</strong>
                      <span
                        className={`heat-map-status ${selectedJob.job_status || ""}`}
                      >
                        {selectedJob.job_status || "—"}
                      </span>
                    </div>
                    <p className="heat-map-job-meta">
                      {selectedJob.issue || "—"}
                      {selectedJob.jobType ? ` · ${selectedJob.jobType}` : ""}
                      {selectedJob.dateTime
                        ? ` · ${formatShortDate(selectedJob.dateTime)}`
                        : ""}
                    </p>
                    <p className="heat-map-job-coords">
                      {selectedJob.lat.toFixed(5)}, {selectedJob.lng.toFixed(5)}
                    </p>
                    <Link
                      to={`/jobs/${selectedJob._id}`}
                      className="heat-map-job-link"
                    >
                      View full job details
                    </Link>
                  </div>
                  <button
                    type="button"
                    className="heat-map-nearby-btn"
                    onClick={() =>
                      loadNearby(selectedJob.lat, selectedJob.lng, radiusKm, false)
                    }
                  >
                    Show other jobs nearby
                  </button>
                </div>
              )}

              {!selectedJob && (
                <>
              <div className="heat-map-radius-row">
                <span>
                  {nearbyState.isFetching
                    ? "Loading…"
                    : `${nearbyTotal.toLocaleString()} jobs within`}
                </span>
                <select
                  className="heat-map-select heat-map-select-sm"
                  value={radiusKm}
                  onChange={(e) => onRadiusChange(Number(e.target.value))}
                >
                  {RADIUS_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r} km
                    </option>
                  ))}
                </select>
              </div>

              {nearbyState.isError && (
                <p className="heat-map-stats-error">Failed to load nearby jobs</p>
              )}

              <ul className="heat-map-job-list">
                {nearbyJobs.map((job) => (
                  <li key={job._id} className="heat-map-job-card">
                    <div className="heat-map-job-card-top">
                      <strong>{job.clientName || "Unknown"}</strong>
                      <span className={`heat-map-status ${job.job_status || ""}`}>
                        {job.job_status || "—"}
                      </span>
                    </div>
                    <p className="heat-map-job-meta">
                      {job.issue || "—"}
                      {job.dateTime
                        ? ` · ${formatShortDate(job.dateTime)}`
                        : ""}
                    </p>
                    <Link
                      to={`/jobs/${job._id}`}
                      className="heat-map-job-link"
                    >
                      View job
                    </Link>
                  </li>
                ))}
                {!nearbyState.isFetching &&
                  nearbyJobs.length === 0 &&
                  clickCenter && (
                    <li className="heat-map-side-muted">
                      No jobs in this radius.
                    </li>
                  )}
              </ul>
                </>
              )}

              {selectedJob && nearbyState.data?.jobs?.length > 0 && (
                <>
                  <h4 className="heat-map-subtitle">Other jobs nearby</h4>
                  <ul className="heat-map-job-list">
                    {nearbyJobs
                      .filter((job) => job._id !== selectedJob._id)
                      .map((job) => (
                        <li key={job._id} className="heat-map-job-card">
                          <div className="heat-map-job-card-top">
                            <strong>{job.clientName || "Unknown"}</strong>
                            <span
                              className={`heat-map-status ${job.job_status || ""}`}
                            >
                              {job.job_status || "—"}
                            </span>
                          </div>
                          <p className="heat-map-job-meta">
                            {job.issue || "—"}
                            {job.dateTime
                              ? ` · ${formatShortDate(job.dateTime)}`
                              : ""}
                          </p>
                          <Link
                            to={`/jobs/${job._id}`}
                            className="heat-map-job-link"
                          >
                            View job
                          </Link>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {!panelOpen && (
            <p className="heat-map-side-hint">
              Click a dot to view that job, or empty map area for nearby jobs.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

export default JobHeatMapView;
