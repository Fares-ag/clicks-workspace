import { apiSlice } from "./apiSlice";

export const performanceApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPerformance: builder.query({
      query: ({ page = 1, limit = 10, search = "" } = {}) => ({
        url: `/performance?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`,
        method: "GET"
      }),
      providesTags: ["Performance"]
    }),
    exportPerformanceCSV: builder.query({
      query: () => ({
        url: "/performance/export-csv",
        method: "GET",
        responseHandler: (response) => response.text()
      })
    })
  })
});

export const {
  useGetPerformanceQuery,
  useLazyExportPerformanceCSVQuery
} = performanceApi;
