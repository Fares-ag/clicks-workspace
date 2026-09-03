import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_ADMIN, STAGING_ADMIN_TOKEN } from "../config.js";

export const options = {
  stages: [
    { duration: "1m", target: 5 },
    { duration: "3m", target: 30 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

const headers = {
  Authorization: `Bearer ${STAGING_ADMIN_TOKEN}`,
  "Content-Type": "application/json",
};

export default function () {
  const searches = ["ahm", "5551", "test"];
  const pages = [1, 2, 3, 4, 5];
  const page = pages[Math.floor(Math.random() * pages.length)];
  const search = searches[Math.floor(Math.random() * searches.length)];

  const listRes = http.get(
    `${BASE_ADMIN}/api/jobs?page=${page}&limit=40&search=${encodeURIComponent(search)}`,
    { headers }
  );
  check(listRes, { "jobs list 200": (r) => r.status === 200 });

  if (listRes.status === 200) {
    try {
      const jobs = JSON.parse(listRes.body).jobs || [];
      if (jobs[0]?._id) {
        const detail = http.get(`${BASE_ADMIN}/api/jobs/${jobs[0]._id}`, { headers });
        check(detail, { "job detail 200": (r) => r.status === 200 });
      }
    } catch (_) {}
  }

  sleep(1);
}
