import { apiSlice } from "./apiSlice";

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (credentials) => ({
        url: "/auth/login",
        method: "POST",
        body: credentials
      })
    }),
    logout: builder.mutation({
      query: (body) => ({
        url: "/auth/logout",
        method: "POST",
        body
      })
    }),
    forgotPassword: builder.mutation({
      query: (body) => ({
        url: "/auth/forgot-password",
        method: "POST",
        body
      })
    })
  })
});

export const { useLoginMutation, useLogoutMutation, useForgotPasswordMutation } = authApi;
