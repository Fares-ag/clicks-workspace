import { apiSlice } from "./apiSlice";

export const dashboardApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getNavBadges: builder.query({
      query: () => ({
        url: "/dashboard/nav-badges",
        method: "GET",
      }),
      providesTags: ["NavBadges"],
    }),
    getDashboardSummary: builder.query({
      query: () => ({
        url: "/dashboard/summary",
        method: "GET",
      }),
      providesTags: ["Dashboard", "SOS"],
    }),
    getEarningsData: builder.query({
      query: (timeframe = "12months") => ({
        url: `/dashboard/earnings?timeframe=${timeframe}`,
        method: "GET",
      }),
      providesTags: ["Dashboard"],
    }),
    getJobCompletionData: builder.query({
      query: (timeframe = "12months") => ({
        url: `/dashboard/job-completion?timeframe=${timeframe}`,
        method: "GET",
      }),
      providesTags: ["Dashboard"],
    }),
    getAllTechniciansPerformance: builder.query({
      query: () => ({
        url: "/dashboard/technician-performance",
        method: "GET",
      }),
      providesTags: ["Dashboard"],
    }),
    getEarningsByDate: builder.query({
      query: (dateString) => {
        let formattedDate;
        if (!dateString) {
          const today = new Date();
          const year = today.getFullYear();
          const month = String(today.getMonth() + 1).padStart(2, "0");
          const day = String(today.getDate()).padStart(2, "0");
          formattedDate = `${year}-${month}-${day}`;
        } else if (dateString instanceof Date) {
          const year = dateString.getFullYear();
          const month = String(dateString.getMonth() + 1).padStart(2, "0");
          const day = String(dateString.getDate()).padStart(2, "0");
          formattedDate = `${year}-${month}-${day}`;
        } else {
          // Already a local calendar-day string (YYYY-MM-DD) — never convert it
          // through UTC, which would shift it a day back in Qatar (UTC+3).
          formattedDate = String(dateString).slice(0, 10);
        }
        return {
          url: `/dashboard/earnings-by-date?date=${formattedDate}`,
          method: "GET",
        };
      },
      providesTags: ["Dashboard"],
    }),
  }),
});

export const {
  useGetNavBadgesQuery,
  useGetDashboardSummaryQuery,
  useGetEarningsDataQuery,
  useGetJobCompletionDataQuery,
  useGetAllTechniciansPerformanceQuery,
  useGetEarningsByDateQuery,
} = dashboardApi;
