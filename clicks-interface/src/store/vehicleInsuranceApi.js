import { apiSlice } from "./apiSlice";

export const vehicleInsuranceApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getVehicleInsurances: builder.query({
      query: ({ page = 1, limit = 10, search = "", status } = {}) => {
        let url = `/vehicle-insurance?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
        if (status) {
          url += `&status=${encodeURIComponent(status)}`;
        }
        return {
          url,
          method: "GET"
        };
      },
      providesTags: ["VehicleInsurance"]
    }),
    getVehicleInsuranceById: builder.query({
      query: (id) => ({
        url: `/vehicle-insurance/${id}`,
        method: "GET"
      }),
      providesTags: ["VehicleInsurance"]
    }),
    createVehicleInsurance: builder.mutation({
      query: (body) => ({
        url: "/vehicle-insurance",
        method: "POST",
        body
      }),
      invalidatesTags: ["VehicleInsurance"]
    }),
    updateVehicleInsurance: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/vehicle-insurance/${id}`,
        method: "PUT",
        body
      }),
      invalidatesTags: ["VehicleInsurance"]
    }),
    deleteVehicleInsurance: builder.mutation({
      query: (id) => ({
        url: `/vehicle-insurance/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: ["VehicleInsurance"]
    })
  })
});

export const {
  useGetVehicleInsurancesQuery,
  useGetVehicleInsuranceByIdQuery,
  useCreateVehicleInsuranceMutation,
  useUpdateVehicleInsuranceMutation,
  useDeleteVehicleInsuranceMutation
} = vehicleInsuranceApi;
