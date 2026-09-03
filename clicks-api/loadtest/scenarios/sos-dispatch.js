import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_TECH, STAGING_ADMIN_TOKEN } from "../config.js";

export const options = {
  vus: 20,
  duration: "3m",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1500"],
  },
};

export default function () {
  const headers = { Authorization: `Bearer ${STAGING_ADMIN_TOKEN}` };
  const health = http.get(`${BASE_TECH}/api/health/live`);
  check(health, { "tech api live": (r) => r.status === 200 });

  const sosList = http.get(`${BASE_TECH.replace(/5001/, "5000")}/api/sos?status=pending&limit=1`, {
    headers,
  });
  check(sosList, { "sos poll": (r) => r.status === 200 || r.status === 404 });

  sleep(3);
}
