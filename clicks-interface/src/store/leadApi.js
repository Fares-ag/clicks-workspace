import { apiSlice } from "./apiSlice";

export const leadApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getLeads: builder.query({
      query: ({ page = 1, limit = 20, search = "", status, open, businessPortal } = {}) => {
        let url = `/leads?page=${page}&limit=${limit}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;
        if (open) url += "&open=1";
        if (businessPortal) url += "&businessPortal=1";
        return { url, method: "GET" };
      },
      providesTags: ["Lead"],
      keepUnusedDataFor: 180,
    }),
    getLeadById: builder.query({
      query: (id) => ({ url: `/leads/${id}`, method: "GET" }),
      providesTags: (_r, _e, id) => [{ type: "Lead", id }],
    }),
    getLeadByServiceRequest: builder.query({
      query: (serviceRequestId) => ({
        url: `/leads/by-service-request/${serviceRequestId}`,
        method: "GET",
      }),
      providesTags: ["Lead"],
    }),
    createLead: builder.mutation({
      query: (body) => ({ url: "/leads", method: "POST", body }),
      invalidatesTags: ["Lead"],
    }),
    updateLead: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/leads/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Lead", id }, "Lead"],
    }),
    convertLead: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/leads/${id}/convert`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["Lead", "Job", "ServiceRequest"],
    }),
    markLeadLost: builder.mutation({
      query: ({ id, lost_reason }) => ({
        url: `/leads/${id}/lost`,
        method: "POST",
        body: { lost_reason },
      }),
      invalidatesTags: ["Lead"],
    }),
  }),
});

export const {
  useGetLeadsQuery,
  useGetLeadByIdQuery,
  useGetLeadByServiceRequestQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useConvertLeadMutation,
  useMarkLeadLostMutation,
} = leadApi;
