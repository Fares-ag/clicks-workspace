import { apiSlice } from "./apiSlice";

export const vehicleConfigApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getVehicleMakes: builder.query({
      query: () => ({
        url: "/vehicle-makes",
        method: "GET"
      }),
      providesTags: ["VehicleMake"]
    }),
    createVehicleMake: builder.mutation({
      query: (body) => ({
        url: "/vehicle-makes",
        method: "POST",
        body
      }),
      invalidatesTags: ["VehicleMake"]
    }),
    updateVehicleMake: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/vehicle-makes/${id}`,
        method: "PUT",
        body
      }),
      invalidatesTags: ["VehicleMake"]
    }),
    deleteVehicleMake: builder.mutation({
      query: (id) => ({
        url: `/vehicle-makes/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: ["VehicleMake"]
    }),
    getVehicleModels: builder.query({
      query: (makeId) => ({
        url: makeId ? `/vehicle-models?makeId=${makeId}` : "/vehicle-models",
        method: "GET"
      }),
      providesTags: ["VehicleModel"]
    }),
    createVehicleModel: builder.mutation({
      query: (body) => ({
        url: "/vehicle-models",
        method: "POST",
        body
      }),
      invalidatesTags: ["VehicleModel"]
    }),
    updateVehicleModel: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/vehicle-models/${id}`,
        method: "PUT",
        body
      }),
      invalidatesTags: ["VehicleModel"]
    }),
    deleteVehicleModel: builder.mutation({
      query: (id) => ({
        url: `/vehicle-models/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: ["VehicleModel"]
    }),
    getVehicleModelsByMake: builder.query({
      query: (makeId) => ({
        url: `/vehicle-models/by-make/${makeId}`,
        method: "GET"
      }),
      providesTags: ["VehicleModel"]
    })
  })
});

export const {
  useGetVehicleMakesQuery,
  useCreateVehicleMakeMutation,
  useUpdateVehicleMakeMutation,
  useDeleteVehicleMakeMutation,
  useGetVehicleModelsQuery,
  useCreateVehicleModelMutation,
  useUpdateVehicleModelMutation,
  useDeleteVehicleModelMutation,
  useGetVehicleModelsByMakeQuery
} = vehicleConfigApi;
