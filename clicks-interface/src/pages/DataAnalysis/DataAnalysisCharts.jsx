import React from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const COLORS = ["#F04438", "#DC6803", "#EA4949", "#B52020", "#F79009", "#667085", "#12B76A", "#7A5AF8"];

const tooltipStyle = {
  backgroundColor: "#fff",
  border: "1px solid #E4E7EC",
  borderRadius: "8px",
};

function ChartCard({ title, subtitle, children, empty }) {
  return (
    <div className="data-analysis-card">
      <h2>{title}</h2>
      {subtitle ? <p className="data-analysis-chart-subtitle">{subtitle}</p> : null}
      {empty ? <div className="data-analysis-empty">{empty}</div> : children}
    </div>
  );
}

export function TrendChart({ items, grain }) {
  const data = items || [];
  const grainLabel = grain === "week" ? "week" : grain === "month" ? "month" : "day";
  return (
    <ChartCard
      title="Jobs and revenue trend"
      subtitle={`Qatar ${grainLabel} buckets`}
      empty={data.length ? "" : "No trend data for this period."}
    >
      <div className="data-analysis-chart">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
            <XAxis dataKey="date" stroke="#667085" style={{ fontSize: 12 }} minTickGap={24} />
            <YAxis yAxisId="jobs" stroke="#667085" style={{ fontSize: 12 }} allowDecimals={false} />
            <YAxis yAxisId="revenue" orientation="right" stroke="#667085" style={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) =>
                name === "Revenue" ? [`QAR ${Number(value || 0).toLocaleString()}`, name] : [value, name]
              }
            />
            <Legend />
            <Line
              yAxisId="jobs"
              type="monotone"
              dataKey="jobs"
              name="Jobs"
              stroke="#F04438"
              strokeWidth={2}
              dot={data.length < 40}
            />
            <Line
              yAxisId="revenue"
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="#DC6803"
              strokeWidth={2}
              dot={data.length < 40}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function RankedBarChart({ title, rows, nameKey, valueKey = "count", empty }) {
  const data = (rows || []).slice(0, 12).map((row) => ({
    ...row,
    label: String(row[nameKey] || "Unmapped").slice(0, 28),
    value: Number(row[valueKey]) || 0,
  }));
  return (
    <ChartCard title={title} empty={data.length ? "" : empty || "No rows for this filter."}>
      <div className="data-analysis-chart">
        <ResponsiveContainer width="100%" height={Math.max(240, data.length * 32)}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" horizontal={false} />
            <XAxis type="number" stroke="#667085" style={{ fontSize: 12 }} allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={120} stroke="#667085" style={{ fontSize: 12 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" name="Jobs" fill="#F04438" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function HourChart({ hours }) {
  const data = (hours || []).map((row) => ({
    ...row,
    label: `${String(row.hour).padStart(2, "0")}:00`,
  }));
  return (
    <ChartCard title="Jobs by hour (Qatar)" empty={data.some((row) => row.count) ? "" : "No hourly data."}>
      <div className="data-analysis-chart">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
            <XAxis dataKey="label" stroke="#667085" style={{ fontSize: 11 }} interval={1} />
            <YAxis stroke="#667085" style={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" name="Jobs" fill="#DC6803" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function WeekdayChart({ weekdays }) {
  const data = weekdays || [];
  return (
    <ChartCard title="Jobs by weekday (Qatar)" empty={data.some((row) => row.count) ? "" : "No weekday data."}>
      <div className="data-analysis-chart">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F2F4F7" />
            <XAxis dataKey="label" stroke="#667085" style={{ fontSize: 12 }} />
            <YAxis stroke="#667085" style={{ fontSize: 12 }} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" name="Jobs" fill="#EA4949" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function SharePieChart({ title, rows, nameKey, valueKey = "count" }) {
  const data = (rows || []).slice(0, 8).map((row) => ({
    name: String(row[nameKey] || "Unknown").slice(0, 22),
    value: Number(row[valueKey]) || 0,
  }));
  return (
    <ChartCard title={title} empty={data.length ? "" : "No mix for this period."}>
      <div className="data-analysis-chart data-analysis-chart--pie">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={56} outerRadius={96} paddingAngle={2}>
              {data.map((entry, index) => (
                <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
