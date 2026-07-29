import { apiSlice } from "./apiSlice";

export const businessApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getBusinesses: builder.query({
      query: ({ page = 1, limit = 50, search = "", isActive } = {}) => {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        if (search) params.set("search", search);
        if (isActive === true || isActive === "true") params.set("isActive", "true");
        if (isActive === false || isActive === "false") params.set("isActive", "false");
        return {
          url: `/businesses?${params.toString()}`,
          method: "GET",
        };
      },
      providesTags: ["Business"],
    }),
    getBusiness: builder.query({
      query: (id) => ({
        url: `/businesses/${id}`,
        method: "GET",
      }),
      providesTags: (result, error, id) => [{ type: "Business", id }],
    }),
    getBusinessStats: builder.query({
      query: (id) => ({
        url: `/businesses/${id}/stats`,
        method: "GET",
      }),
      providesTags: (result, error, id) => [{ type: "Business", id }],
    }),
    createBusiness: builder.mutation({
      query: (body) => ({
        url: "/businesses",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Business"],
    }),
    updateBusiness: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/businesses/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Business"],
    }),
    createBusinessUser: builder.mutation({
      query: ({ businessId, ...body }) => ({
        url: `/businesses/${businessId}/users`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["Business"],
    }),
    updateBusinessUser: builder.mutation({
      query: ({ businessId, userId, ...body }) => ({
        url: `/businesses/${businessId}/users/${userId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Business"],
    }),
    resetBusinessUserPassword: builder.mutation({
      query: ({ businessId, userId, password }) => ({
        url: `/businesses/${businessId}/users/${userId}/reset-password`,
        method: "POST",
        body: { password },
      }),
    }),
  }),
});

export const {
  useGetBusinessesQuery,
  useGetBusinessQuery,
  useGetBusinessStatsQuery,
  useCreateBusinessMutation,
  useUpdateBusinessMutation,
  useCreateBusinessUserMutation,
  useUpdateBusinessUserMutation,
  useResetBusinessUserPasswordMutation,
} = businessApi;
