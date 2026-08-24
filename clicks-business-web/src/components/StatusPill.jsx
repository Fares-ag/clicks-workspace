import React from "react";
import { getJobStatusLabel, getJobStatusThemeClass } from "../utils/jobStatusLabels";

function StatusPill({ status }) {
  return (
    <span className={`status-pill ${getJobStatusThemeClass(status)}`}>
      {getJobStatusLabel(status)}
    </span>
  );
}

export default StatusPill;
