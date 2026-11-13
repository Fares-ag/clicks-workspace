import { apiSlice } from "./apiSlice";

export const sosApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getSOSRequests: builder.query({
      query: ({ page = 1, limit = 20, search = "", status, sort } = {}) => {
        let url = `/sos?page=${page}&limit=${limit}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;
        if (sort) url += `&sort=${encodeURIComponent(sort)}`;
        return { url, method: "GET" };
      },
      providesTags: ["SOS"],
      keepUnusedDataFor: 180,
    }),
    getSOSById: builder.query({
      query: (id) => ({ url: `/sos/${id}`, method: "GET" }),
      providesTags: ["SOS"],
    }),
    claimSOS: builder.mutation({
      query: (id) => ({
        url: `/sos/${id}/claim`,
        method: "POST",
        body: {},
      }),
      invalidatesTags: ["SOS", "NavBadges"],
    }),
    claimNextSOS: builder.mutation({
      query: () => ({
        url: `/sos/claim-next`,
        method: "POST",
        body: {},
      }),
      invalidatesTags: ["SOS", "NavBadges"],
    }),
  }),
});

export const {
  useGetSOSRequestsQuery,
  useGetSOSByIdQuery,
  useClaimSOSMutation,
  useClaimNextSOSMutation,
} = sosApi;
