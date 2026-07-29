import { apiSlice } from "./apiSlice";

export const partnerApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPartners: builder.query({
      query: ({ page = 1, limit = 50, search = "", status } = {}) => {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        if (search) params.set("search", search);
        if (status) params.set("status", status);
        return { url: `/partners?${params.toString()}`, method: "GET" };
      },
      providesTags: ["Partner"],
    }),
    getPartner: builder.query({
      query: (id) => ({ url: `/partners/${id}`, method: "GET" }),
      providesTags: (r, e, id) => [{ type: "Partner", id }],
    }),
    getPartnerEarnings: builder.query({
      query: (id) => ({ url: `/partners/${id}/earnings`, method: "GET" }),
      providesTags: (r, e, id) => [{ type: "Partner", id: `${id}-earnings` }],
    }),
    getPartnerWithdrawals: builder.query({
      query: (id) => ({ url: `/partners/${id}/withdrawals`, method: "GET" }),
      providesTags: (r, e, id) => [{ type: "Partner", id: `${id}-withdrawals` }],
    }),
    updatePartnerWithdrawal: builder.mutation({
      query: ({ id, withdrawalId, ...body }) => ({
        url: `/partners/${id}/withdrawals/${withdrawalId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (r, e, { id }) => [
        { type: "Partner", id: `${id}-withdrawals` },
        { type: "Partner", id },
      ],
    }),
    createPartner: builder.mutation({
      query: (body) => ({ url: "/partners", method: "POST", body }),
      invalidatesTags: ["Partner"],
    }),
    updatePartner: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/partners/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Partner"],
    }),
    startPartnerNextPeriod: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/partners/${id}/start-next-period`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["Partner"],
    }),
  }),
});

export const {
  useGetPartnersQuery,
  useGetPartnerQuery,
  useGetPartnerEarningsQuery,
  useGetPartnerWithdrawalsQuery,
  useUpdatePartnerWithdrawalMutation,
  useCreatePartnerMutation,
  useUpdatePartnerMutation,
  useStartPartnerNextPeriodMutation,
} = partnerApi;
