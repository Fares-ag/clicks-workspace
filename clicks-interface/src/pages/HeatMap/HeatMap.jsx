import React from "react";
import { Link } from "react-router-dom";
import JobHeatMapView from "./JobHeatMapView";
import "./HeatMap.css";

function HeatMap() {
  return (
    <div className="heat-map-page">
      <div className="heat-map-header">
        <div className="heat-map-header-main">
          <h1 className="heat-map-title">Heat Map</h1>
          <span className="heat-map-badge">Live job density</span>
        </div>
        <div className="heat-map-breadcrumb">
          <Link to="/dashboard">Dashboard</Link>
          <span className="heat-map-breadcrumb-sep">&gt;</span>
          <span className="heat-map-breadcrumb-current">Heat Map</span>
        </div>
      </div>

      <p className="heat-map-description">
        Job density from all admin jobs with coordinates. Colors use the Clicks
        brand scale — pale rose for sparse areas up to deep red for hotspots.
        Click the map to drill into nearby jobs.
      </p>

      <JobHeatMapView />
    </div>
  );
}

export default HeatMap;
