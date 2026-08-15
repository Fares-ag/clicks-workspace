import React from "react";
import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import { canAccessPath } from "../utils/adminRoles";
import { getEffectiveRole } from "../utils/authRole";

function ProtectedRoute({ children }) {
  const token = useSelector((state) => state.auth.token);
  const user = useSelector((state) => state.auth.user);
  const role = getEffectiveRole(user, token);
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessPath(role, location.pathname)) {
    return <Navigate to="/dashboard" replace state={{ from: location }} />;
  }

  return children;
}

export default ProtectedRoute;
