import { apiSlice } from "./apiSlice";

// `tagTypes` lives on the root apiSlice; enhanceEndpoints is the supported way to
// register an extra tag from an injecting module (it pushes onto the same array
// the middleware reads, so "Vendors" is known before any request runs).
const financeApi = apiSlice.enhanceEndpoints({ addTagTypes: ["Vendors", "Purchases", "Technicians"] });

// Finance history is a sibling resource of the job, so it rides the existing
// "Job" tag type under a namespaced id instead of adding another tag type.
const historyTag = (id) => ({ type: "Job", id: `history-${id}` });

const argId = (arg) =>
  arg && typeof arg === "object" ? arg.id ?? arg._id : arg;

export const portalApi = financeApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (body) => ({
        url: "/finance/auth/login",
        method: "POST",
        body,
      }),
    }),
    me: builder.query({
      query: () => "/finance/me",
      providesTags: ["Me"],
    }),
    dashboard: builder.query({
      query: () => "/finance/dashboard",
      providesTags: ["Dashboard"],
    }),
    listJobs: builder.query({
      query: ({
        page = 1,
        limit = 20,
        search = "",
        finance_status,
        from,
        to,
        payment_method,
        vendor_id,
        technician_id,
      } = {}) => ({
        url: "/finance/jobs",
        params: {
          page,
          limit,
          ...(search ? { search } : {}),
          ...(finance_status ? { finance_status } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(payment_method ? { payment_method } : {}),
          ...(vendor_id ? { vendor_id } : {}),
          ...(technician_id ? { technician_id } : {}),
        },
      }),
      providesTags: ["Jobs"],
    }),
    listTechnicians: builder.query({
      query: () => "/finance/technicians",
      providesTags: ["Technicians"],
    }),
    getJob: builder.query({
      query: (id) => `/finance/jobs/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Job", id }],
    }),
    getJobHistory: builder.query({
      query: (arg) => `/finance/jobs/${argId(arg)}/history`,
      providesTags: (_r, _e, arg) => [historyTag(argId(arg))],
    }),
    updateFinance: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/finance/jobs/${id}/finance`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        "Jobs",
        "Dashboard",
        { type: "Job", id },
        historyTag(id),
      ],
    }),
    auditJob: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/finance/jobs/${id}/audit`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        "Jobs",
        "Dashboard",
        { type: "Job", id },
        historyTag(id),
      ],
    }),
    reauditJob: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/finance/jobs/${id}/reaudit`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        "Jobs",
        "Dashboard",
        { type: "Job", id },
        historyTag(id),
      ],
    }),
    listVendors: builder.query({
      query: ({ search = "", isActive } = {}) => ({
        url: "/finance/vendors",
        params: {
          ...(search ? { search } : {}),
          ...(isActive === undefined || isActive === null || isActive === ""
            ? {}
            : { isActive }),
        },
      }),
      providesTags: ["Vendors"],
    }),
    createVendor: builder.mutation({
      query: (body) => ({
        url: "/finance/vendors",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Vendors"],
    }),
    updateVendor: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/finance/vendors/${id}`,
        method: "PATCH",
        body,
      }),
      // A renamed vendor is echoed inside every job's cost rows, so the cached
      // job detail has to be refetched too.
      invalidatesTags: ["Vendors", "Job"],
    }),
    deleteVendor: builder.mutation({
      query: (arg) => ({
        url: `/finance/vendors/${argId(arg)}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Vendors", "Job", "Purchases"],
    }),
    listPurchases: builder.query({
      query: ({
        page = 1,
        limit = 20,
        search = "",
        vendor_id,
        job_id,
        from,
        to,
      } = {}) => ({
        url: "/finance/purchases",
        params: {
          page,
          limit,
          ...(search ? { search } : {}),
          ...(vendor_id ? { vendor_id } : {}),
          ...(job_id ? { job_id } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
      }),
      providesTags: ["Purchases"],
    }),
    vendorPurchaseSummary: builder.query({
      query: ({ vendor_id, from, to } = {}) => ({
        url: "/finance/purchases/summary",
        params: {
          ...(vendor_id ? { vendor_id } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
      }),
      providesTags: ["Purchases"],
    }),
    createJobPurchase: builder.mutation({
      query: ({ jobId, ...body }) => ({
        url: `/finance/jobs/${jobId}/purchases`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["Purchases", "Jobs", "Dashboard", "Job"],
    }),
    updatePurchase: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/finance/purchases/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Purchases", "Jobs", "Dashboard", "Job"],
    }),
    voidPurchase: builder.mutation({
      query: (arg) => ({
        url: `/finance/purchases/${argId(arg)}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Purchases", "Jobs", "Dashboard", "Job"],
    }),
  }),
});

export const {
  useLoginMutation,
  useMeQuery,
  useDashboardQuery,
  useListJobsQuery,
  useListTechniciansQuery,
  useGetJobQuery,
  useGetJobHistoryQuery,
  useUpdateFinanceMutation,
  useAuditJobMutation,
  useReauditJobMutation,
  useListVendorsQuery,
  useCreateVendorMutation,
  useUpdateVendorMutation,
  useDeleteVendorMutation,
  useListPurchasesQuery,
  useVendorPurchaseSummaryQuery,
  useCreateJobPurchaseMutation,
  useUpdatePurchaseMutation,
  useVoidPurchaseMutation,
} = portalApi;
