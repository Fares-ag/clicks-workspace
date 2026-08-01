import { apiSlice } from "./apiSlice";

export const jobApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getJobs: builder.query({
      query: ({ page = 1, limit = 10, search = "", status, technician } = {}) => {
        let url = `/jobs?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
        if (status) {
          url += `&status=${encodeURIComponent(status)}`;
        }
        if (technician) {
          url += `&technician=${encodeURIComponent(technician)}`;
        }
        return {
          url,
          method: "GET"
        };
      },
      providesTags: ["Job"]
    }),
    createJob: builder.mutation({
      query: (body) => ({
        url: "/jobs",
        method: "POST",
        body
      }),
      invalidatesTags: ["Job"]
    }),
    updateJob: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/jobs/${id}`,
        method: "PUT",
        body
      }),
      invalidatesTags: ["Job"]
    }),
    deleteJob: builder.mutation({
      query: (id) => ({
        url: `/jobs/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: ["Job"]
    }),
    getJobById: builder.query({
      query: (id) => ({
        url: `/jobs/${id}`,
        method: "GET"
      }),
      providesTags: ["Job"]
    }),
    getJobRepairs: builder.query({
      query: (jobId) => ({
        url: `/jobs/${jobId}/repairs`,
        method: "GET"
      }),
      providesTags: ["Repair"]
    }),
    getJobReceipt: builder.query({
      query: (jobId) => ({
        url: `/receipts/job/${jobId}`,
        method: "GET"
      })
    }),
    importJobs: builder.mutation({
      query: (formData) => ({
        url: "/jobs/import",
        method: "POST",
        body: formData,
      }),
      invalidatesTags: ["Job"],
    }),
    getJobHeatmap: builder.query({
      query: ({
        from,
        to,
        status,
        jobType,
        source,
        hourFrom,
        hourTo,
        north,
        south,
        east,
        west,
        zoom,
      } = {}) => {
        const params = new URLSearchParams();
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (status) params.set("status", status);
        if (jobType) params.set("jobType", jobType);
        if (source) params.set("source", source);
        if (hourFrom != null) params.set("hourFrom", String(hourFrom));
        if (hourTo != null) params.set("hourTo", String(hourTo));
        if (north != null) params.set("north", String(north));
        if (south != null) params.set("south", String(south));
        if (east != null) params.set("east", String(east));
        if (west != null) params.set("west", String(west));
        if (zoom != null) params.set("zoom", String(zoom));
        const qs = params.toString();
        return {
          url: `/jobs/heatmap${qs ? `?${qs}` : ""}`,
          method: "GET",
        };
      },
      keepUnusedDataFor: 300,
      providesTags: [{ type: "Job", id: "HEATMAP" }],
    }),
    getJobsNearby: builder.query({
      query: ({
        lat,
        lng,
        radiusKm = 1,
        from,
        to,
        status,
        jobType,
        hourFrom,
        hourTo,
      } = {}) => {
        const params = new URLSearchParams();
        params.set("lat", String(lat));
        params.set("lng", String(lng));
        params.set("radiusKm", String(radiusKm));
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (status) params.set("status", status);
        if (jobType) params.set("jobType", jobType);
        if (hourFrom != null) params.set("hourFrom", String(hourFrom));
        if (hourTo != null) params.set("hourTo", String(hourTo));
        return {
          url: `/jobs/nearby?${params.toString()}`,
          method: "GET",
        };
      },
    }),
  })
});

export const {
  useGetJobsQuery,
  useCreateJobMutation,
  useUpdateJobMutation,
  useDeleteJobMutation,
  useGetJobByIdQuery,
  useGetJobRepairsQuery,
  useGetJobReceiptQuery,
  useLazyGetJobReceiptQuery,
  useImportJobsMutation,
  useGetJobHeatmapQuery,
  useLazyGetJobHeatmapQuery,
  useGetJobsNearbyQuery,
  useLazyGetJobsNearbyQuery,
} = jobApi;
