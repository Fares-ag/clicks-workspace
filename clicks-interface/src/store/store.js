import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "./apiSlice";
import authReducer, { setCredentials } from "./authSlice";
import "./sosApi";

// Load auth state from localStorage
function loadAuthState() {
  try {
    const serializedState = localStorage.getItem("auth");
    if (!serializedState) return undefined;
    return JSON.parse(serializedState);
  } catch (e) {
    return undefined;
  }
}

// Save auth state to localStorage
function saveAuthState(state) {
  try {
    const serializedState = JSON.stringify(state);
    localStorage.setItem("auth", serializedState);
  } catch (e) {}
}

const preloadedAuthState = loadAuthState();

const store = configureStore({
  reducer: {
    [apiSlice.reducerPath]: apiSlice.reducer,
    auth: authReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(apiSlice.middleware),
  preloadedState: {
    auth: preloadedAuthState || undefined
  }
});

// Subscribe to store changes and persist auth state
store.subscribe(() => {
  saveAuthState(store.getState().auth);
});

export default store;
