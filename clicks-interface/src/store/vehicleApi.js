import { apiSlice } from "./apiSlice";

export const vehicleApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getVehicles: builder.query({
      query: ({ page = 1, limit = 10, search = "", status } = {}) => {
        let url = `/vehicles?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
        if (status) {
          url += `&status=${encodeURIComponent(status)}`;
        }
        return {
          url,
          method: "GET"
        };
      },
      providesTags: ["Vehicle"]
    }),
    createVehicle: builder.mutation({
      query: (body) => ({
        url: "/vehicles",
        method: "POST",
        body,
        formData: true
      }),
      invalidatesTags: ["Vehicle"]
    }),
    updateVehicle: builder.mutation({
      query: ({ id, body }) => ({
        url: `/vehicles/${id}`,
        method: "PUT",
        body,
        formData: true
      }),
      invalidatesTags: ["Vehicle"]
    }),
    deleteVehicle: builder.mutation({
      query: (id) => ({
        url: `/vehicles/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: ["Vehicle"]
    }),
    getVehicleById: builder.query({
      query: (id) => ({
        url: `/vehicles/${id}`,
        method: "GET"
      }),
      providesTags: ["Vehicle"]
    }),
    uploadDocuments: builder.mutation({
      query: ({ id, formData }) => ({
        url: `/vehicles/${id}/upload-documents`,
        method: "POST",
        body: formData,
        formData: true
      }),
      invalidatesTags: ["Vehicle"]
    }),
    toggleVehicleStatus: builder.mutation({
      query: (id) => ({
        url: `/vehicles/${id}/toggle-active`,
        method: "PATCH"
      }),
      invalidatesTags: ["Vehicle"]
    }),
    unassignTechnician: builder.mutation({
      query: (id) => ({
        url: `/vehicles/${id}/unassign-technician`,
        method: "PATCH"
      }),
      invalidatesTags: ["Vehicle"]
    })
  })
});

export const {
  useGetVehiclesQuery,
  useCreateVehicleMutation,
  useUpdateVehicleMutation,
  useDeleteVehicleMutation,
  useGetVehicleByIdQuery,
  useUploadDocumentsMutation,
  useToggleVehicleStatusMutation,
  useUnassignTechnicianMutation
} = vehicleApi;
