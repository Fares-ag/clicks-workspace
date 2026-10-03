import { configureStore } from "@reduxjs/toolkit";
import { apiSlice } from "./apiSlice";
import authReducer, { setCredentials } from "./authSlice";
import { hydrateAuthState } from "../utils/authRole";
import "./sosApi";
import "./serviceRequestApi";
import "./leadApi";
import "./financeApi";
import "./notificationApi";

// TODO: follow-up: move to httpOnly cookies — do not persist tokens in localStorage long-term.
// Load auth state from localStorage
function loadAuthState() {
  try {
    const serializedState = localStorage.getItem("auth");
    if (!serializedState) return undefined;
    return hydrateAuthState(JSON.parse(serializedState));
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

// Persist auth only when the auth slice identity changes — RTK Query cache
// updates used to rewrite localStorage on every list/poll tick.
let prevAuth = store.getState().auth;
store.subscribe(() => {
  const auth = store.getState().auth;
  if (auth === prevAuth) return;
  prevAuth = auth;
  saveAuthState(auth);
});

export default store;
