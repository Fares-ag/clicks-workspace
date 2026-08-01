import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";

// Auth
import Login from "./pages/Login.jsx";

// Layout & Protection
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminLayout from "./components/AdminLayout.jsx";

// Dashboard
import Dashboard from "./pages/Dashboard";

// Admin Management
import { AdminManagement, AdminDetails } from "./pages/AdminManagement";

// Technician Management
import { Technicians, TechnicianDetails } from "./pages/TechnicianManagement";

// Vehicle Management
import { Vehicles, VehicleDetails, VehicleMakes, VehicleModels, VehicleInsurance } from "./pages/VehicleManagement";

// Job Management
import Jobs from "./pages/JobManagement";
import AddNewJob from "./pages/JobManagement/AddNewJob.jsx";
import JobDetails from "./pages/JobDetails/JobDetails.jsx";

// Client Management
import ClientManagement, { ClientDetails } from "./pages/ClientManagement";

// Performance
import Performance from "./pages/Performance";

// Calls
import Calls from "./pages/Calls";

// Live Map
import LiveMap from "./pages/LiveMap";

// Heat Map
import HeatMap from "./pages/HeatMap";

// Source Configurator
import Sources from "./pages/SourceConfigurator";

// Business Management
import {
  Businesses,
  AddBusiness,
  BusinessDetails,
} from "./pages/BusinessManagement";

// Subscriptions
import { Subscriptions } from "./pages/Subscriptions";

// Partner Management
import { Partners, PartnerDetails } from "./pages/PartnerManagement";

// Support Tickets
import { SupportTickets, TicketDetails } from "./pages/SupportTickets";

// SOS Inbox
import SOSInbox from "./pages/SOSInbox";
import ServiceRequestsInbox from "./pages/ServiceRequests";

// Public Pages
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage.jsx";
import TermsAndConditionsPage from "./pages/TermsAndConditionsPage.jsx";
import SupportPage from "./pages/SupportPage.jsx";

// Demo/Other
import DemoPage from "./pages/DemoPage.jsx";

function App() {
  const token = useSelector((state) => state.auth.token);
  const location = useLocation();

  return (
    <Routes>
      <Route
        path="/login"
        element={
          token ? (
            <Navigate to="/dashboard" replace state={{ from: location }} />
          ) : (
            <Login />
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Dashboard />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin-management"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <AdminManagement />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin-management/:id"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <AdminDetails />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/live-map"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <LiveMap />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/heat-map"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <HeatMap />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <ClientManagement />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/:id"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <ClientDetails />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/performance"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Performance />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/calls"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Calls />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vehicle-insurance"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <VehicleInsurance />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vehicle-makes"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <VehicleMakes />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vehicle-models"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <VehicleModels />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/technicians"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Technicians />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/technicians/:id"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <TechnicianDetails />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vehicles"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Vehicles />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vehicles/:id"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <VehicleDetails />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sources"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Sources />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/businesses"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Businesses />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/businesses/new"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <AddBusiness />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/businesses/:id"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <BusinessDetails />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/partners"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Partners />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/partners/:id"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <PartnerDetails />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/subscriptions"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Subscriptions />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Jobs />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs/new"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <AddNewJob />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/jobs/:id"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <JobDetails />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sos"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <SOSInbox />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/service-requests"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <ServiceRequestsInbox />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/support-tickets"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <SupportTickets />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/support-tickets/:id"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <TicketDetails />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      {/* Public Pages — No Auth Required */}
      <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
      <Route path="/terms-and-conditions" element={<TermsAndConditionsPage />} />
      <Route path="/support" element={<SupportPage />} />
      <Route
        path="/demo"
        element={
          <AdminLayout>
            <DemoPage />
          </AdminLayout>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
