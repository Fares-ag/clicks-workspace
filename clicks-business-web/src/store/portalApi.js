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
  useAnalyticsQuery,
  useListJobsQuery,
  useGetJobQuery,
  useCreateJobMutation,
  useVehicleMakesQuery,
  useLazyVehicleModelsQuery,
} = portalApi;
