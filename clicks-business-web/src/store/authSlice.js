import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  user: null,
  business: null,
  token: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      state.user = action.payload.user ?? null;
      state.business = action.payload.business ?? null;
      state.token = action.payload.accessToken ?? null;
    },
    logout: (state) => {
      state.user = null;
      state.business = null;
      state.token = null;
    },
  },
});

export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;
