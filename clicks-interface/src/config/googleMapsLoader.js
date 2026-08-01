/** Shared Google Maps loader config — one id for the whole admin app. */
export const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

export const GOOGLE_MAPS_LOADER_ID = "clicks-admin-maps";

export const googleMapsLoaderOptions = {
  id: GOOGLE_MAPS_LOADER_ID,
  googleMapsApiKey: GOOGLE_MAPS_API_KEY,
};
