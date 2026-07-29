import React from "react";
import { statusClass, statusLabel } from "../utils/phone";

function StatusPill({ status }) {
  return (
    <span className={`status-pill ${statusClass(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

export default StatusPill;
