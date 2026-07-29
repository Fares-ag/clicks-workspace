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
    })
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
  useLazyGetJobReceiptQuery
} = jobApi;
