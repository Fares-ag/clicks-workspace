import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "./apiSlice";
import authReducer, { logout } from "./authSlice";
import "./portalApi";

const AUTH_KEY = "business-auth";

// Clearing the auth slice alone leaves the RTK Query cache (dashboard summary,
// earnings, job lists) in the store, so the next business signing in on the same
// browser would be served the previous tenant's data. Wipe it on every logout —
// manual, or the automatic one from a 401/403.
const resetApiCacheOnLogout = (storeApi) => (next) => (action) => {
  const result = next(action);
  if (action.type === logout.type) {
    storeApi.dispatch(apiSlice.util.resetApiState());
  }
  return result;
};

// TODO: follow-up: move to httpOnly cookies — do not persist tokens in localStorage long-term.
function loadAuthState() {
  try {
    const serialized = localStorage.getItem(AUTH_KEY);
    if (!serialized) return undefined;
    return JSON.parse(serialized);
  } catch {
    return undefined;
  }
}

function saveAuthState(state) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

const preloadedAuthState = loadAuthState();

const store = configureStore({
  reducer: {
    [apiSlice.reducerPath]: apiSlice.reducer,
    auth: authReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(apiSlice.middleware, resetApiCacheOnLogout),
  preloadedState: {
    auth: preloadedAuthState || undefined,
  },
});

store.subscribe(() => {
  saveAuthState(store.getState().auth);
});

export default store;
