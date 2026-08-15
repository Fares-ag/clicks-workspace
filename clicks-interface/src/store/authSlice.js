import { createSlice } from "@reduxjs/toolkit";
import { getEffectiveRole } from "../utils/authRole";

const initialState = {
  user: null,
  token: null,
  refreshToken: null
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const { user, accessToken, refreshToken } = action.payload;
      const role = getEffectiveRole(user, accessToken);
      state.user = role ? { ...(user || {}), role } : user;
      state.token = accessToken;
      state.refreshToken = refreshToken;
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.refreshToken = null;
    }
  }
});

export const { setCredentials, logout } = authSlice.actions;
export default authSlice.reducer;
