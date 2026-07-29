import { apiSlice } from "./apiSlice";

export const subscriptionApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getSubscriptions: builder.query({
      query: ({ page = 1, limit = 50, search = "", status } = {}) => {
        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("limit", String(limit));
        if (search) params.set("search", search);
        if (status) params.set("status", status);
        return { url: `/subscriptions?${params.toString()}`, method: "GET" };
      },
      providesTags: ["Subscription"],
    }),
    getSubscription: builder.query({
      query: (id) => ({ url: `/subscriptions/${id}`, method: "GET" }),
      providesTags: (r, e, id) => [{ type: "Subscription", id }],
    }),
    lookupSubscriptionByPlate: builder.query({
      query: (plate) => ({
        url: `/subscriptions/lookup?plate=${encodeURIComponent(plate)}`,
        method: "GET",
      }),
    }),
    createSubscription: builder.mutation({
      query: (body) => ({ url: "/subscriptions", method: "POST", body }),
      invalidatesTags: ["Subscription"],
    }),
    updateSubscription: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/subscriptions/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Subscription"],
    }),
    cancelSubscription: builder.mutation({
      query: (id) => ({
        url: `/subscriptions/${id}/cancel`,
        method: "POST",
      }),
      invalidatesTags: ["Subscription"],
    }),
  }),
});

export const {
  useGetSubscriptionsQuery,
  useGetSubscriptionQuery,
  useLazyLookupSubscriptionByPlateQuery,
  useCreateSubscriptionMutation,
  useUpdateSubscriptionMutation,
  useCancelSubscriptionMutation,
} = subscriptionApi;
