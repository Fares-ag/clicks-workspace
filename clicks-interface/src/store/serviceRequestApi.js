import { apiSlice } from "./apiSlice";

export const serviceRequestApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getServiceRequests: builder.query({
      query: ({ page = 1, limit = 20, search = "", status, timing } = {}) => {
        let url = `/service-requests?page=${page}&limit=${limit}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;
        if (timing) url += `&timing=${encodeURIComponent(timing)}`;
        return { url, method: "GET" };
      },
      providesTags: ["ServiceRequest"],
      keepUnusedDataFor: 180,
    }),
    getServiceRequestById: builder.query({
      query: (id) => ({ url: `/service-requests/${id}`, method: "GET" }),
      providesTags: ["ServiceRequest"],
    }),
  }),
});

export const {
  useGetServiceRequestsQuery,
  useGetServiceRequestByIdQuery,
} = serviceRequestApi;
