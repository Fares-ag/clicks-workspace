import React from "react";
import {
  getJobStatusCssClass,
  getJobStatusLabel,
} from "../utils/jobStatusLabels";

function JobStatusPill({ status }) {
  const cssClass = getJobStatusCssClass(status);
  return (
    <span className={`job-status-pill ${cssClass}`}>
      {getJobStatusLabel(status)}
    </span>
  );
}

export default JobStatusPill;
