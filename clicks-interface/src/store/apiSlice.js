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
 * On a 403 response the refresh token is used to get a new access token,
 * then the original request is retried exactly once. If refresh itself fails
 * the user is logged out so they see the login screen instead of a broken UI.
 */
async function baseQueryWithReauth(args, api, extraOptions) {
  let result = await rawBase(args, api, extraOptions);

  if (result.error?.status === 403) {
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
  endpoints: () => ({}),
});
