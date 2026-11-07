import { apiSlice } from "./apiSlice";

// Finance refunds and mark-paid. Any finance user may request a refund or
// mark a job paid (reference required); approving/rejecting a refund needs
// the finance "admin" role and a different person from the requester.
const withTags = apiSlice.enhanceEndpoints({ addTagTypes: ["Refunds"] });

const refundListTag = { type: "Refunds", id: "LIST" };

export const refundsApi = withTags.injectEndpoints({
  endpoints: (builder) => ({
    listRefunds: builder.query({
      query: ({ status, jobId, page = 1, limit = 20 } = {}) => ({
        url: "/finance/refunds",
        params: {
          page,
          limit,
          ...(status ? { status } : {}),
          ...(jobId ? { job_id: jobId } : {}),
        },
      }),
      providesTags: [refundListTag],
    }),
    getRefund: builder.query({
      query: (id) => `/finance/refunds/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Refunds", id }],
    }),
    requestRefund: builder.mutation({
      query: (body) => ({ url: "/finance/refunds", method: "POST", body }),
      invalidatesTags: [refundListTag],
    }),
    approveRefund: builder.mutation({
      query: ({ id, manual_reference }) => ({
        url: `/finance/refunds/${id}/approve`,
        method: "POST",
        body: manual_reference ? { manual_reference } : {},
      }),
      // A failed SkipCash call still moves the case to `failed`: refresh either way.
      invalidatesTags: (_r, _e, { id }) => [refundListTag, { type: "Refunds", id }, "Job", "Jobs"],
    }),
    rejectRefund: builder.mutation({
      query: ({ id, reason }) => ({
        url: `/finance/refunds/${id}/reject`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: (_r, _e, { id }) => [refundListTag, { type: "Refunds", id }],
    }),
    downloadCreditNote: builder.query({
      query: (id) => ({
        url: `/finance/refunds/${id}/credit-note`,
        cache: "no-cache",
        responseHandler: (response) => (response.ok ? response.blob() : response.json()),
      }),
    }),
    markJobPaid: builder.mutation({
      query: ({ id, payment_method, reference, reason }) => ({
        url: `/finance/jobs/${id}/mark-paid`,
        method: "POST",
        body: { payment_method, reference, reason },
      }),
      invalidatesTags: (_r, _e, { id }) => ["Jobs", "Dashboard", { type: "Job", id }],
    }),
  }),
});

export const {
  useListRefundsQuery,
  useGetRefundQuery,
  useRequestRefundMutation,
  useApproveRefundMutation,
  useRejectRefundMutation,
  useLazyDownloadCreditNoteQuery,
  useMarkJobPaidMutation,
} = refundsApi;
