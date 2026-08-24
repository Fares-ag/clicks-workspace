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

// authenticateFinance answers an expired/invalid token with 403, not 401, so a
// dead session has to clear auth on those too or the portal renders zeros
// forever. It is an allow-list, not "any 403": requireFinanceRole also answers
// 403 ("Insufficient finance role") and that is an authorisation refusal on a
// perfectly live session — logging the operator out there would be wrong.
const SESSION_DEAD_403 = [
  "Invalid token",
  "Finance access required",
  "Finance user inactive or not found",
];

function isSessionDead(error) {
  if (!error) return false;
  if (error.status === 401) return true;
  if (error.status !== 403) return false;
  return SESSION_DEAD_403.includes(error.data?.message);
}

async function baseQueryWithAuth(args, api, extraOptions) {
  const result = await rawBase(args, api, extraOptions);
  if (isSessionDead(result.error)) {
    api.dispatch(logout({ sessionExpired: true }));
  }
  return result;
}
export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithAuth,
  tagTypes: ["Me", "Dashboard", "Jobs", "Job"],
  endpoints: () => ({}),
});
