import { apiSlice } from "./apiSlice";

/** Query string for the technician activity endpoints (skips empty filters). */
function activityQuery({
  page = 1,
  limit = 25,
  search = "",
  technician_id,
  event,
  category,
  outcome,
  job_id,
  from,
  to,
} = {}) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (search) params.set("search", search);
  if (technician_id) params.set("technician_id", technician_id);
  if (event) params.set("event", event);
  if (category) params.set("category", category);
  if (outcome) params.set("outcome", outcome);
  if (job_id) params.set("job_id", job_id);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return params.toString();
}

export const technicianActivityApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getTechnicianActivity: builder.query({
      query: (args) => ({
        url: `/technician-activity?${activityQuery(args)}`,
        method: "GET",
      }),
      providesTags: ["TechnicianActivity"],
    }),
    getTechnicianActivityFilters: builder.query({
      query: () => ({ url: "/technician-activity/filters", method: "GET" }),
      providesTags: ["TechnicianActivity"],
    }),
    getTechnicianActivitySummary: builder.query({
      query: ({ days = 7, technician_id } = {}) => {
        const params = new URLSearchParams();
        params.set("days", String(days));
        if (technician_id) params.set("technician_id", technician_id);
        return {
          url: `/technician-activity/summary?${params.toString()}`,
          method: "GET",
        };
      },
      providesTags: ["TechnicianActivity"],
    }),
    /** CSV of the current filter — needs the auth header, so it goes through RTK. */
    exportTechnicianActivityCSV: builder.query({
      query: (args) => ({
        url: `/technician-activity/export?${activityQuery(args)}`,
        method: "GET",
        responseHandler: (response) => response.text(),
      }),
    }),
  }),
});

export const {
  useGetTechnicianActivityQuery,
  useGetTechnicianActivityFiltersQuery,
  useGetTechnicianActivitySummaryQuery,
  useLazyExportTechnicianActivityCSVQuery,
} = technicianActivityApi;
