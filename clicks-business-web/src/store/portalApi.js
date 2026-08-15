import { apiSlice } from "./apiSlice";

export const portalApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (body) => ({
        url: "/business/auth/login",
        method: "POST",
        body,
      }),
    }),
    me: builder.query({
      query: () => "/business/me",
      providesTags: ["Me"],
    }),
    dashboard: builder.query({
      query: () => "/business/dashboard",
      providesTags: ["Dashboard"],
    }),
    dashboardSummary: builder.query({
      query: () => "/business/dashboard/summary",
      providesTags: ["Dashboard"],
    }),
    dashboardEarnings: builder.query({
      query: (timeframe = "12months") => ({
        url: "/business/dashboard/earnings",
        params: { timeframe },
      }),
      providesTags: ["Dashboard"],
    }),
    dashboardJobCompletion: builder.query({
      query: (timeframe = "12months") => ({
        url: "/business/dashboard/job-completion",
        params: { timeframe },
      }),
      providesTags: ["Dashboard"],
    }),
    dashboardTechnicianPerformance: builder.query({
      query: () => "/business/dashboard/technician-performance",
      providesTags: ["Dashboard"],
    }),
    dashboardEarningsByDate: builder.query({
      query: (dateString) => {
        let formattedDate;
        if (!dateString) {
          const today = new Date();
          formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        } else if (dateString instanceof Date) {
          formattedDate = `${dateString.getFullYear()}-${String(dateString.getMonth() + 1).padStart(2, "0")}-${String(dateString.getDate()).padStart(2, "0")}`;
        } else {
          formattedDate = dateString.split("T")[0];
        }
        return {
          url: "/business/dashboard/earnings-by-date",
          params: { date: formattedDate },
        };
      },
      providesTags: ["Dashboard"],
    }),
    analytics: builder.query({
      query: (period = "month") => ({
        url: "/business/analytics",
        params: { period },
      }),
      providesTags: ["Analytics"],
    }),
    listJobs: builder.query({
      query: ({ page = 1, limit = 50, bucket } = {}) => ({
        url: "/business/jobs",
        params: {
          page,
          limit,
          ...(bucket && bucket !== "all" ? { bucket } : {}),
        },
      }),
      providesTags: ["Jobs"],
    }),
    getJob: builder.query({
      query: (id) => `/business/jobs/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Job", id }],
    }),
    createJob: builder.mutation({
      query: (body) => ({
        url: "/business/jobs",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Jobs", "Dashboard", "Analytics"],
    }),
    vehicleMakes: builder.query({
      query: () => "/business/vehicle-makes",
    }),
    vehicleModels: builder.query({
      query: (makeId) => `/business/vehicle-models/by-make/${makeId}`,
    }),
  }),
});

export const {
  useLoginMutation,
  useMeQuery,
  useLazyMeQuery,
  useDashboardQuery,
  useDashboardSummaryQuery,
  useDashboardEarningsQuery,
  useDashboardJobCompletionQuery,
  useDashboardTechnicianPerformanceQuery,
  useDashboardEarningsByDateQuery,
  useAnalyticsQuery,
  useListJobsQuery,
  useGetJobQuery,
  useCreateJobMutation,
  useVehicleMakesQuery,
  useLazyVehicleModelsQuery,
} = portalApi;
