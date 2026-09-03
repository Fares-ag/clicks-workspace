import http from "k6/http";
import { check, sleep } from "k6";
import {
  BASE_ADMIN,
  STAGING_ADMIN_TOKEN,
  STAGING_BUSINESS_TOKEN,
  STAGING_FINANCE_TOKEN,
} from "../config.js";

export const options = {
  vus: 20,
  duration: "5m",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

export default function () {
  const adminHeaders = { Authorization: `Bearer ${STAGING_ADMIN_TOKEN}` };
  const bizHeaders = { Authorization: `Bearer ${STAGING_BUSINESS_TOKEN}` };
  const finHeaders = { Authorization: `Bearer ${STAGING_FINANCE_TOKEN}` };

  const adminDash = http.get(`${BASE_ADMIN}/api/dashboard/summary`, { headers: adminHeaders });
  check(adminDash, { "admin dashboard": (r) => r.status === 200 });

  const bizDash = http.get(`${BASE_ADMIN}/api/business/dashboard`, { headers: bizHeaders });
  check(bizDash, { "business dashboard": (r) => r.status === 200 || r.status === 304 });

  const finDash = http.get(`${BASE_ADMIN}/api/finance/dashboard`, { headers: finHeaders });
  check(finDash, { "finance dashboard": (r) => r.status === 200 });

  sleep(30);
}
