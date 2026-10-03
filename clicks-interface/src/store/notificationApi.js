import { apiSlice } from "./apiSlice";

export const notificationApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getNotifications: builder.query({
      query: ({ limit = 30, cursor } = {}) => {
        const params = new URLSearchParams();
        params.set("limit", String(limit));
        if (cursor) params.set("cursor", cursor);
        return {
          url: `/notifications?${params.toString()}`,
          method: "GET",
        };
      },
      providesTags: ["Notifications"],
      keepUnusedDataFor: 60,
    }),
    getUnreadNotificationCount: builder.query({
      query: () => ({
        url: "/notifications/unread-count",
        method: "GET",
      }),
      providesTags: ["Notifications"],
      keepUnusedDataFor: 30,
    }),
    markNotificationsRead: builder.mutation({
      query: (body) => ({
        url: "/notifications/mark-read",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Notifications"],
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useGetUnreadNotificationCountQuery,
  useMarkNotificationsReadMutation,
} = notificationApi;
