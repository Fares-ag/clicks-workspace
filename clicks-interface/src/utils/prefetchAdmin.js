import { dashboardApi } from "../store/dashboardApi";

/** Warm only the cheap shell queries. Page lists load when you open them. */
export function prefetchCriticalAdminData(dispatch) {
  dispatch(dashboardApi.util.prefetch("getNavBadges", undefined, { force: false }));
}
