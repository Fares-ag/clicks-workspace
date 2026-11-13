import { apiSlice } from "./apiSlice";

const membershipTags = ["CustomerMembership"];

export const customerMembershipApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getCustomerMemberships: builder.query({
      query: ({ page = 1, limit = 20, search = "", status, customer_id } = {}) => ({
        url: "/customer-subscriptions",
        params: {
          page,
          limit,
          ...(search ? { search } : {}),
          ...(status ? { status } : {}),
          ...(customer_id ? { customer_id } : {}),
        },
      }),
      providesTags: membershipTags,
    }),
    getCustomerMembership: builder.query({
      query: (id) => `/customer-subscriptions/${id}`,
      providesTags: (_r, _e, id) => [{ type: "CustomerMembership", id }],
    }),
    getCustomerVehicles: builder.query({
      query: ({ search = "", customer_id, limit = 20 } = {}) => ({
        url: "/customer-vehicles",
        params: {
          limit,
          ...(search ? { search } : {}),
          ...(customer_id ? { customer_id } : {}),
        },
      }),
    }),
    getCustomerGarage: builder.query({
      query: (customerId) => `/customers/${customerId}/vehicles`,
    }),
    grantMembership: builder.mutation({
      query: (body) => ({ url: "/customer-subscriptions", method: "POST", body }),
      invalidatesTags: membershipTags,
    }),
    extendMembership: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/customer-subscriptions/${id}/extend`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "CustomerMembership", id }, "CustomerMembership"],
    }),
    cancelMembership: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/customer-subscriptions/${id}/cancel`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "CustomerMembership", id }, "CustomerMembership"],
    }),
    refundMembership: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/customer-subscriptions/${id}/refund`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "CustomerMembership", id },
        "CustomerMembership",
        "Refund",
      ],
    }),
    adjustMembershipUsage: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/customer-subscriptions/${id}/usage`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "CustomerMembership", id }, "CustomerMembership"],
    }),
  }),
});

export const {
  useGetCustomerMembershipsQuery,
  useGetCustomerMembershipQuery,
  useGetCustomerVehiclesQuery,
  useGetCustomerGarageQuery,
  useGrantMembershipMutation,
  useExtendMembershipMutation,
  useCancelMembershipMutation,
  useRefundMembershipMutation,
  useAdjustMembershipUsageMutation,
} = customerMembershipApi;
