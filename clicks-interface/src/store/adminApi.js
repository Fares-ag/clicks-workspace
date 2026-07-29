import { apiSlice } from "./apiSlice";

export const adminApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAdmins: builder.query({
      query: ({ page = 1, limit = 10, search = "", role, status } = {}) => {
        let url = `/admins?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
        if (role) {
          url += `&role=${encodeURIComponent(role)}`;
        }
        if (status !== undefined) {
          url += `&status=${status}`;
        }
        return {
          url,
          method: "GET"
        };
      },
      providesTags: ["Admin"]
    }),
    createAdmin: builder.mutation({
      query: (body) => ({
        url: "/admins",
        method: "POST",
        body
      }),
      invalidatesTags: ["Admin"]
    }),
    updateAdmin: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/admins/${id}`,
        method: "PUT",
        body
      }),
      invalidatesTags: ["Admin"]
    }),
    deleteAdmin: builder.mutation({
      query: (id) => ({
        url: `/admins/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: ["Admin"]
    }),
    getAdminById: builder.query({
      query: (id) => ({
        url: `/admins/${id}`,
        method: "GET"
      }),
      providesTags: ["Admin"]
    }),
    toggleAdminStatus: builder.mutation({
      query: ({ id, isActive }) => ({
        url: `/admins/${id}/status`,
        method: "PUT",
        body: { isActive }
      }),
      invalidatesTags: ["Admin"]
    })
  })
});

export const {
  useGetAdminsQuery,
  useCreateAdminMutation,
  useUpdateAdminMutation,
  useDeleteAdminMutation,
  useGetAdminByIdQuery,
  useToggleAdminStatusMutation
} = adminApi;
