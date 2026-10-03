import { apiSlice } from "./apiSlice";

export const technicianApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAssignmentRoster: builder.query({
      query: () => ({
        url: "/technicians/assignment-roster",
        method: "GET",
      }),
      providesTags: ["Technician"],
    }),
    getTechnicians: builder.query({
      query: ({ page = 1, limit = 10, search = "", currentStatus, applicationStatus } = {}) => {
        let url = `/technicians?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
        if (currentStatus) {
          url += `&currentStatus=${encodeURIComponent(currentStatus)}`;
        }
        if (applicationStatus) {
          url += `&applicationStatus=${encodeURIComponent(applicationStatus)}`;
        }
        return {
          url,
          method: "GET"
        };
      },
      providesTags: ["Technician"],
      keepUnusedDataFor: 180,
    }),
    getOnlineTechnicians: builder.query({
      query: () => ({
        url: "/technicians?currentStatus=Online&applicationStatus=Approved&limit=100",
        method: "GET"
      }),
      providesTags: ["Technician"]
    }),
    createTechnician: builder.mutation({
      query: (formData) => ({
        url: "/technicians",
        method: "POST",
        body: formData
      }),
      invalidatesTags: ["Technician"]
    }),
    updateTechnician: builder.mutation({
      query: ({ id, formData, ...updateData }) => {
        // If formData is provided, use it (for file uploads)
        if (formData && formData instanceof FormData) {
          formData.append('_technicianId', id);
          return {
            url: `/technicians/${id}`,
            method: "PUT",
            body: formData
          };
        }
        // Otherwise, send as JSON (for simple updates like applicationStatus)
        return {
          url: `/technicians/${id}`,
          method: "PUT",
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        };
      },
      invalidatesTags: ["Technician"]
    }),
    deleteTechnician: builder.mutation({
      query: (id) => ({
        url: `/technicians/${id}`,
        method: "DELETE"
      }),
      invalidatesTags: ["Technician"]
    }),
    getTechnicianById: builder.query({
      query: (id) => ({
        url: `/technicians/${id}`,
        method: "GET"
      }),
      providesTags: ["Technician"]
    }),
    uploadDocuments: builder.mutation({
      query: ({ id, formData }) => ({
        url: `/technicians/${id}/upload-documents`,
        method: "POST",
        body: formData,
        formData: true
      }),
      invalidatesTags: ["Technician"]
    }),
    getTechnicianPerformance: builder.query({
      query: (id) => ({
        url: `/technicians/${id}/performance`,
        method: "GET"
      }),
      providesTags: ["TechnicianPerformance"]
    }),
    getTechnicianStats: builder.query({
      query: (id) => ({
        url: `/technicians/${id}/stats`,
        method: "GET"
      }),
      providesTags: ["TechnicianStats"]
    }),
    getRecentJobs: builder.query({
      query: ({ id, limit = 10 }) => ({
        url: `/technicians/${id}/recent-jobs?limit=${limit}`,
        method: "GET"
      }),
      providesTags: ["TechnicianJobs"]
    }),
    getSettlements: builder.query({
      query: ({ id, limit = 10 }) => ({
        url: `/technicians/${id}/settlements?limit=${limit}`,
        method: "GET"
      }),
      providesTags: ["TechnicianSettlements"]
    }),
    settleBalance: builder.mutation({
      query: ({ id, amount, notes }) => ({
        url: `/technicians/${id}/settle-balance`,
        method: "POST",
        body: { amount, notes }
      }),
      invalidatesTags: ["TechnicianStats", "TechnicianSettlements", "Technician"]
    }),
    assignVehicle: builder.mutation({
      query: ({ id, vehicleId }) => ({
        url: `/technicians/${id}/assign-vehicle`,
        method: "PATCH",
        body: { vehicleId }
      }),
      invalidatesTags: ["Technician"]
    }),
    getLiveMapTechnicians: builder.query({
      query: () => ({
        url: "/technicians/live-map",
        method: "GET"
      }),
      providesTags: ["LiveMapTechnician"],
      keepUnusedDataFor: 30,
    }),
    toggleTechnicianActive: builder.mutation({
      query: (id) => ({
        url: `/technicians/${id}/toggle-active`,
        method: "PATCH"
      }),
      invalidatesTags: ["Technician"]
    })
  })
});

export const {
  useGetAssignmentRosterQuery,
  useGetTechniciansQuery,
  useGetOnlineTechniciansQuery,
  useCreateTechnicianMutation,
  useUpdateTechnicianMutation,
  useDeleteTechnicianMutation,
  useGetTechnicianByIdQuery,
  useUploadDocumentsMutation,
  useGetTechnicianPerformanceQuery,
  useGetTechnicianStatsQuery,
  useGetRecentJobsQuery,
  useGetSettlementsQuery,
  useSettleBalanceMutation,
  useAssignVehicleMutation,
  useGetLiveMapTechniciansQuery,
  useToggleTechnicianActiveMutation,
} = technicianApi;