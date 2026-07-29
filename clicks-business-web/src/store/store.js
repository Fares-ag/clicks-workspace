import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "./apiSlice";
import authReducer from "./authSlice";
import "./portalApi";

const AUTH_KEY = "business-auth";

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
    getDefaultMiddleware().concat(apiSlice.middleware),
  preloadedState: {
    auth: preloadedAuthState || undefined,
  },
});

store.subscribe(() => {
  saveAuthState(store.getState().auth);
});

export default store;
