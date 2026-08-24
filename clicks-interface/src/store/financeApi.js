import { apiSlice } from "./apiSlice";

export const financeApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getFinanceUsers: builder.query({
      query: () => ({
        url: "/finance-users",
        method: "GET",
      }),
      providesTags: ["FinanceUser"],
    }),
    createFinanceUser: builder.mutation({
      query: (body) => ({
        url: "/finance-users",
        method: "POST",
        body,
      }),
      invalidatesTags: ["FinanceUser"],
    }),
    updateFinanceUser: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/finance-users/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["FinanceUser"],
    }),
    resetFinanceUserPassword: builder.mutation({
      query: ({ id, password }) => ({
        url: `/finance-users/${id}/reset-password`,
        method: "POST",
        body: { password },
      }),
    }),
    // Read-only admin view over the finance portal's numbers.
    getFinanceOverviewSummary: builder.query({
      query: ({ search = "", from, to } = {}) => {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const qs = params.toString();
        return {
          url: qs ? `/finance-overview/summary?${qs}` : "/finance-overview/summary",
          method: "GET",
        };
      },
      providesTags: ["FinanceOverview"],
    }),
    getFinanceOverviewJobs: builder.query({
      query: ({
        status = "audited",
        page = 1,
        limit = 20,
        search = "",
        from,
        to,
      } = {}) => {
        const params = new URLSearchParams();
        params.set("status", status);
        params.set("page", String(page));
        params.set("limit", String(limit));
        if (search) params.set("search", search);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        return {
          url: `/finance-overview/jobs?${params.toString()}`,
          method: "GET",
        };
      },
      providesTags: ["FinanceOverview"],
    }),
  }),
});

export const {
  useGetFinanceUsersQuery,
  useCreateFinanceUserMutation,
  useUpdateFinanceUserMutation,
  useResetFinanceUserPasswordMutation,
  useGetFinanceOverviewSummaryQuery,
  useGetFinanceOverviewJobsQuery,
} = financeApi;
