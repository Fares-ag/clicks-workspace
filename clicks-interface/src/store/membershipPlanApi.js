import { apiSlice } from "./apiSlice";

// Full-admin: membership packages sold in the customer app.
export const membershipPlanApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMembershipPlans: builder.query({
      query: () => ({ url: "/subscription-plans", params: { limit: 100 } }),
      providesTags: ["MembershipPlan"],
    }),
    getMembershipPlanMeta: builder.query({
      query: () => "/subscription-plans/meta",
    }),
    createMembershipPlan: builder.mutation({
      query: (body) => ({ url: "/subscription-plans", method: "POST", body }),
      invalidatesTags: ["MembershipPlan"],
    }),
    updateMembershipPlan: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/subscription-plans/${id}`, method: "PATCH", body }),
      invalidatesTags: ["MembershipPlan"],
    }),
  }),
});

export const {
  useGetMembershipPlansQuery,
  useGetMembershipPlanMetaQuery,
  useCreateMembershipPlanMutation,
  useUpdateMembershipPlanMutation,
} = membershipPlanApi;
