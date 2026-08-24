import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useSelector } from "react-redux";
import ProtectedRoute from "./components/ProtectedRoute";
import FinanceLayout from "./components/FinanceLayout";
import Login from "./pages/Login/Login";
import Dashboard from "./pages/Dashboard/Dashboard";
import Jobs from "./pages/Jobs/Jobs";
import JobDetail from "./pages/JobDetail/JobDetail";
import Vendors from "./pages/Vendors/Vendors";
import Purchases from "./pages/Purchases/Purchases";

function App() {
  const token = useSelector((state) => state.auth.token);

  return (
    <Routes>
      <Route
        path="/login"
        element={token ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        element={
          <ProtectedRoute>
            <FinanceLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/:id" element={<JobDetail />} />
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/purchases" element={<Purchases />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
