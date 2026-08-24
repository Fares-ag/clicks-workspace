import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { logout } from "./authSlice";

const rawBase = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_BASE_URL || "/api",
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.token;
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
    return headers;
  },
});

async function baseQueryWithAuth(args, api, extraOptions) {
  const result = await rawBase(args, api, extraOptions);
  // authenticateBusiness answers an expired/invalid token (and a deactivated
  // business) with 403, not 401, so a dead session has to clear auth on both or
  // the portal keeps a useless token and renders zeros forever.
  if (result.error?.status === 401 || result.error?.status === 403) {
    api.dispatch(logout({ sessionExpired: true }));
  }
  if (result.meta?.response?.status === 304) {
    return { data: undefined, meta: result.meta };
  }
  return result;
}

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithAuth,
  tagTypes: ["Me", "Dashboard", "Analytics", "Jobs", "Job"],
  endpoints: () => ({}),
});
