import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  user: null,
  token: null,
  sessionExpired: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      state.user = action.payload.user ?? null;
      state.token = action.payload.accessToken ?? null;
      state.sessionExpired = false;
    },
    logout: (state, action) => {
      state.user = null;
      state.token = null;
      state.sessionExpired = Boolean(action.payload?.sessionExpired);
    },
  },
});
export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;
