import { apiSlice } from "./apiSlice";

export const supportTicketApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getSupportTickets: builder.query({
      query: ({ page = 1, limit = 20, search = "", status, source } = {}) => {
        let url = `/contact-us?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;
        if (source) url += `&source=${encodeURIComponent(source)}`;
        return { url, method: "GET" };
      },
      providesTags: ["SupportTicket"]
    }),
    getSupportTicketById: builder.query({
      query: (id) => ({ url: `/contact-us/${id}`, method: "GET" }),
      providesTags: ["SupportTicket"]
    }),
    updateSupportTicket: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/contact-us/${id}`,
        method: "PUT",
        body
      }),
      invalidatesTags: ["SupportTicket"]
    })
  })
});

export const {
  useGetSupportTicketsQuery,
  useGetSupportTicketByIdQuery,
  useUpdateSupportTicketMutation
} = supportTicketApi;
