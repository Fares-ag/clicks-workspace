import React, { useMemo } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function parseTime(value) {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) {
    return { hour: "", minute: "" };
  }
  const [h, m] = value.split(":");
  return { hour: String(Number(h)), minute: String(Number(m)) };
}

function formatTime(hour, minute) {
  if (hour === "" || minute === "") return "";
  const h = Number(hour);
  const m = Number(minute);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return "";
  }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * 24-hour time filter — dropdowns instead of OS clock / type="time".
 */
export default function TimeFilterField({ id, label, value, onChange }) {
  const { hour, minute } = useMemo(() => parseTime(value), [value]);

  const setPart = (part, next) => {
    const h = part === "hour" ? next : hour;
    const m = part === "minute" ? next : minute;
    onChange(formatTime(h, m));
  };

  return (
    <div className="filter-field">
      <label className="filter-label" htmlFor={id}>
        {label}
      </label>
      <div className="filter-time-row" id={id}>
        <select
          className="filter-native-input filter-time-select"
          aria-label={`${label} hour`}
          value={hour}
          onChange={(e) => setPart("hour", e.target.value)}
        >
          <option value="">Hr</option>
          {HOURS.map((h) => (
            <option key={h} value={String(h)}>
              {String(h).padStart(2, "0")}
            </option>
          ))}
        </select>
        <span className="filter-time-colon" aria-hidden="true">
          :
        </span>
        <select
          className="filter-native-input filter-time-select"
          aria-label={`${label} minute`}
          value={minute}
          onChange={(e) => setPart("minute", e.target.value)}
        >
          <option value="">Min</option>
          {MINUTES.map((m) => (
            <option key={m} value={String(m)}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
