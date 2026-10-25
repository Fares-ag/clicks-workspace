import { apiSlice } from "./apiSlice";

function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "") return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const dataAnalysisApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAnalysisOverview: builder.query({
      query: (params) => ({ url: `/data-analysis/overview${toQuery(params)}` }),
      providesTags: ["DataAnalysis"],
    }),
    getAnalysisIssues: builder.query({
      query: (params) => ({ url: `/data-analysis/issues${toQuery(params)}` }),
      providesTags: ["DataAnalysis"],
    }),
    getAnalysisVehicles: builder.query({
      query: (params) => ({ url: `/data-analysis/vehicles${toQuery(params)}` }),
      providesTags: ["DataAnalysis"],
    }),
    getAnalysisCustomers: builder.query({
      query: (params) => ({ url: `/data-analysis/customers${toQuery(params)}` }),
      providesTags: ["DataAnalysis"],
    }),
    getAnalysisServices: builder.query({
      query: (params) => ({ url: `/data-analysis/services${toQuery(params)}` }),
      providesTags: ["DataAnalysis"],
    }),
    getAnalysisSources: builder.query({
      query: (params) => ({ url: `/data-analysis/sources${toQuery(params)}` }),
      providesTags: ["DataAnalysis"],
    }),
    getAnalysisTime: builder.query({
      query: (params) => ({ url: `/data-analysis/time${toQuery(params)}` }),
      providesTags: ["DataAnalysis"],
    }),
    getAnalysisLocations: builder.query({
      query: (params) => ({ url: `/data-analysis/locations${toQuery(params)}` }),
      providesTags: ["DataAnalysis"],
    }),
    getAnalysisCrosstabs: builder.query({
      query: (params) => ({ url: `/data-analysis/crosstabs${toQuery(params)}` }),
      providesTags: ["DataAnalysis"],
    }),
    getAnalysisJobs: builder.query({
      query: (params) => ({ url: `/data-analysis/jobs${toQuery(params)}` }),
      providesTags: ["DataAnalysis"],
    }),
    getAnalysisCatalogs: builder.query({
      query: () => ({ url: "/data-analysis/catalogs" }),
      providesTags: ["DataAnalysis"],
    }),
    getAnalysisQuality: builder.query({
      query: (params) => ({ url: `/data-analysis/quality${toQuery(params)}` }),
      providesTags: ["DataAnalysis"],
    }),
    previewAnalysisQuality: builder.mutation({
      query: (body) => ({
        url: "/data-analysis/quality/preview",
        method: "POST",
        body,
      }),
    }),
    applyAnalysisQuality: builder.mutation({
      query: (body) => ({
        url: "/data-analysis/quality/apply",
        method: "POST",
        body,
      }),
      invalidatesTags: ["DataAnalysis", "Job", "Lead"],
    }),
    addAnalysisAlias: builder.mutation({
      query: (body) => ({
        url: "/data-analysis/quality/aliases",
        method: "POST",
        body,
      }),
      invalidatesTags: ["DataAnalysis"],
    }),
    exportAnalysis: builder.query({
      query: (params) => ({
        url: `/data-analysis/export${toQuery(params)}`,
        responseHandler: (response) => response.text(),
      }),
    }),
  }),
});

export const {
  useGetAnalysisOverviewQuery,
  useGetAnalysisIssuesQuery,
  useGetAnalysisVehiclesQuery,
  useGetAnalysisCustomersQuery,
  useGetAnalysisServicesQuery,
  useGetAnalysisSourcesQuery,
  useGetAnalysisTimeQuery,
  useGetAnalysisLocationsQuery,
  useGetAnalysisCrosstabsQuery,
  useGetAnalysisJobsQuery,
  useGetAnalysisCatalogsQuery,
  useGetAnalysisQualityQuery,
  usePreviewAnalysisQualityMutation,
  useApplyAnalysisQualityMutation,
  useAddAnalysisAliasMutation,
  useLazyExportAnalysisQuery,
} = dataAnalysisApi;
