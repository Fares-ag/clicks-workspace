import http from "k6/http";
import { check, sleep } from "k6";
import { BASE_TECH, STAGING_TECH_TOKEN, STAGING_CUSTOMER_TOKEN } from "../config.js";

export const options = {
  vus: 50,
  duration: "5m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<600"],
  },
};

export default function () {
  const techHeaders = { Authorization: `Bearer ${STAGING_TECH_TOKEN}` };
  const custHeaders = { Authorization: `Bearer ${STAGING_CUSTOMER_TOKEN}` };

  const session = http.get(`${BASE_TECH}/api/jobs/technician/session`, { headers: techHeaders });
  check(session, { "tech session": (r) => r.status === 200 });

  const history = http.get(`${BASE_TECH}/api/technicians/jobs?page=1&limit=20`, { headers: techHeaders });
  check(history, { "tech history p1": (r) => r.status === 200 });

  const custHistory = http.get(`${BASE_TECH}/api/jobs/customer/history?page=1`, { headers: custHeaders });
  check(custHistory, { "customer history": (r) => r.status === 200 });

  sleep(2);
}
