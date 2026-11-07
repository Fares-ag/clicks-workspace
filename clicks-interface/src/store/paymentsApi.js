import { apiSlice } from "./apiSlice";

// Full-admin payment tooling: refund cases, the SkipCash payment ledger and
// outbox events that exhausted their retries.
export const paymentsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getRefunds: builder.query({
      query: ({ status, jobId, page = 1, limit = 20 } = {}) => ({
        url: "/payments/refunds",
        params: {
          page,
          limit,
          ...(status ? { status } : {}),
          ...(jobId ? { job_id: jobId } : {}),
        },
      }),
      providesTags: ["Refund"],
    }),
    getRefund: builder.query({
      query: (id) => `/payments/refunds/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Refund", id }],
    }),
    requestRefund: builder.mutation({
      query: (body) => ({ url: "/payments/refunds", method: "POST", body }),
      invalidatesTags: ["Refund", "Job", "PaymentAttempt"],
    }),
    approveRefund: builder.mutation({
      query: ({ id, manual_reference }) => ({
        url: `/payments/refunds/${id}/approve`,
        method: "POST",
        body: manual_reference ? { manual_reference } : {},
      }),
      // A failed SkipCash call still changes the case (to `failed`), so
      // refresh on error too.
      invalidatesTags: ["Refund", "Job", "PaymentAttempt"],
    }),
    rejectRefund: builder.mutation({
      query: ({ id, reason }) => ({
        url: `/payments/refunds/${id}/reject`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: ["Refund"],
    }),
    downloadCreditNote: builder.query({
      query: (id) => ({
        url: `/payments/refunds/${id}/credit-note`,
        method: "GET",
        cache: "no-cache",
        responseHandler: (response) =>
          response.ok ? response.blob() : response.json(),
      }),
    }),
    getPaymentAttempts: builder.query({
      query: ({ stale, status, outcome, jobId, limit = 200 } = {}) => ({
        url: "/payments/payment-attempts",
        params: {
          limit,
          ...(stale ? { stale: "1" } : {}),
          ...(status ? { status } : {}),
          ...(outcome ? { outcome } : {}),
          ...(jobId ? { job_id: jobId } : {}),
        },
      }),
      providesTags: ["PaymentAttempt"],
    }),
    getFailedOutbox: builder.query({
      query: ({ page = 1, limit = 20, type } = {}) => ({
        url: "/payments/outbox/failed",
        params: { page, limit, ...(type ? { type } : {}) },
      }),
      providesTags: ["OutboxEvent"],
    }),
    replayOutbox: builder.mutation({
      query: (id) => ({ url: `/payments/outbox/${id}/replay`, method: "POST" }),
      invalidatesTags: ["OutboxEvent"],
    }),
  }),
});

export const {
  useGetRefundsQuery,
  useGetRefundQuery,
  useRequestRefundMutation,
  useApproveRefundMutation,
  useRejectRefundMutation,
  useLazyDownloadCreditNoteQuery,
  useGetPaymentAttemptsQuery,
  useGetFailedOutboxQuery,
  useReplayOutboxMutation,
} = paymentsApi;
