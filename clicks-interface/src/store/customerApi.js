import { apiSlice } from "./apiSlice";

export const customerApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getCustomers: builder.query({
      query: ({ page = 1, limit = 10, search = "" } = {}) => ({
        url: `/customers?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`,
        method: "GET"
      }),
      providesTags: ["Customer"]
    }),
    getCustomerById: builder.query({
      query: (id) => ({
        url: `/customers/${id}`,
        method: "GET"
      }),
      providesTags: ["Customer"]
    }),
    updateCustomer: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/customers/${id}`,
        method: "PUT",
        body
      }),
      invalidatesTags: ["Customer"]
    }),
    deleteCustomer: builder.mutation({
      query: (id) => ({
        url: `/customers/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: ["Customer"]
    })
  })
});

export const {
  useGetCustomersQuery,
  useGetCustomerByIdQuery,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation
} = customerApi;
