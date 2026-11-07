import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { setCredentials, logout } from "./authSlice";
import { getRoleFromToken } from "../utils/authRole";

const rawBase = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.token;
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
    return headers;
  },
});

/**
 * Wraps rawBase with automatic silent token refresh.
 * On 401 or 403 the refresh token is used to get a new access token,
 * then the original request is retried exactly once. If refresh itself fails
 * (or there is no refresh token) the user is logged out.
 */
function getRequestUrl(args) {
  return typeof args === "string" ? args : args?.url;
}

function withAnalysisTimeout(args) {
  const url = getRequestUrl(args) || "";
  if (!url.includes("/data-analysis/")) return { args, cancel: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28000);
  const next =
    typeof args === "string"
      ? { url: args, signal: controller.signal }
      : { ...args, signal: controller.signal };
  return {
    args: next,
    cancel: () => clearTimeout(timer),
  };
}

async function baseQueryWithReauth(args, api, extraOptions) {
  const timed = withAnalysisTimeout(args);
  let result;
  try {
    result = await rawBase(timed.args, api, extraOptions);
  } finally {
    timed.cancel();
  }
  if (result?.error?.status === "ABORT_ERR" || result?.error?.name === "AbortError") {
    return {
      error: {
        status: 504,
        data: { message: "This range is too large. Narrow the dates or hide historical import." },
      },
    };
  }

  const url = getRequestUrl(args);
  const isAuthEndpoint =
    url === "/auth/login" ||
    url === "/auth/refresh-token" ||
    url === "/auth/logout";
  const needsRefresh =
    !isAuthEndpoint &&
    (result.error?.status === 401 || result.error?.status === 403);

  if (needsRefresh) {
    const { refreshToken } = api.getState().auth;

    if (refreshToken) {
      const refreshResult = await rawBase(
        {
          url: "/auth/refresh-token",
          method: "POST",
          body: { refreshToken },
        },
        api,
        extraOptions
      );

      if (refreshResult.data?.accessToken) {
        const user = api.getState().auth.user || {};
        const roleFromToken = getRoleFromToken(refreshResult.data.accessToken);
        api.dispatch(
          setCredentials({
            user: roleFromToken ? { ...user, role: roleFromToken } : user,
            accessToken: refreshResult.data.accessToken,
            refreshToken,
          })
        );
        // Retry the original request with the fresh token
        result = await rawBase(args, api, extraOptions);
      } else {
        api.dispatch(logout());
      }
    } else {
      api.dispatch(logout());
    }
  }

  return result;
}

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  keepUnusedDataFor: 120,
  refetchOnFocus: false,
  refetchOnReconnect: false,
  tagTypes: [
    "Admin",
    "Business",
    "Customer",
    "Dashboard",
    "DataAnalysis",
    "FinanceOverview",
    "FinanceUser",
    "Job",
    "Lead",
    "LiveMapTechnician",
    "NavBadges",
    "Notifications",
    "Partner",
    "Performance",
    "Repair",
    "ServiceRequest",
    "SOS",
    "Source",
    "SupportTicket",
    "Technician",
    "TechnicianActivity",
    "TechnicianJobs",
    "TechnicianPerformance",
    "TechnicianSettlements",
    "TechnicianStats",
    "Vehicle",
    "VehicleInsurance",
    "VehicleMake",
    "VehicleModel",
  ],
  endpoints: () => ({}),
});
