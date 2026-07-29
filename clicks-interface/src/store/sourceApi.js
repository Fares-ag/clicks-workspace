import { apiSlice } from "./apiSlice";

export const sourceApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getSources: builder.query({
      query: () => ({
        url: "/sources",
        method: "GET"
      }),
      providesTags: ["Source"]
    }),
    createSource: builder.mutation({
      query: (body) => ({
        url: "/sources",
        method: "POST",
        body
      }),
      invalidatesTags: ["Source"]
    }),
    updateSource: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/sources/${id}`,
        method: "PUT",
        body
      }),
      invalidatesTags: ["Source"]
    }),
    deleteSource: builder.mutation({
      query: (id) => ({
        url: `/sources/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: ["Source"]
    }),
    deleteSubSource: builder.mutation({
      query: ({ sourceId, subSourceId }) => ({
        url: `/sources/${sourceId}/subsources/${subSourceId}`,
        method: "DELETE"
      }),
      invalidatesTags: ["Source"]
    }),
    getSourceById: builder.query({
      query: (id) => ({
        url: `/sources/${id}`,
        method: "GET"
      }),
      providesTags: ["Source"]
    })
  })
});

export const {
  useGetSourcesQuery,
  useCreateSourceMutation,
  useUpdateSourceMutation,
  useDeleteSourceMutation,
  useDeleteSubSourceMutation,
  useGetSourceByIdQuery
} = sourceApi;
