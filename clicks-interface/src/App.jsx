import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";

// Auth — keep eager for fast login
import Login from "./pages/Login.jsx";

// Layout & Protection
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminLayout from "./components/AdminLayout.jsx";

const PageFallback = () => (
  <div className="admin-page-loading" style={{ padding: 24 }}>
    Loading…
  </div>
);

function lazyPage(factory) {
  const Lazy = lazy(factory);
  return function LazyPage(props) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}

const Dashboard = lazyPage(() => import("./pages/Dashboard"));
const AdminManagement = lazyPage(() =>
  import("./pages/AdminManagement").then((m) => ({ default: m.AdminManagement }))
);
const AdminDetails = lazyPage(() =>
  import("./pages/AdminManagement").then((m) => ({ default: m.AdminDetails }))
);
const Technicians = lazyPage(() =>
  import("./pages/TechnicianManagement").then((m) => ({ default: m.Technicians }))
);
const TechnicianDetails = lazyPage(() =>
  import("./pages/TechnicianManagement").then((m) => ({ default: m.TechnicianDetails }))
);
const Vehicles = lazyPage(() =>
  import("./pages/VehicleManagement").then((m) => ({ default: m.Vehicles }))
);
const VehicleDetails = lazyPage(() =>
  import("./pages/VehicleManagement").then((m) => ({ default: m.VehicleDetails }))
);
const VehicleMakes = lazyPage(() =>
  import("./pages/VehicleManagement").then((m) => ({ default: m.VehicleMakes }))
);
const VehicleModels = lazyPage(() =>
  import("./pages/VehicleManagement").then((m) => ({ default: m.VehicleModels }))
);
const Jobs = lazyPage(() => import("./pages/JobManagement"));
const AddNewJob = lazyPage(() => import("./pages/JobManagement/AddNewJob.jsx"));
const JobDetails = lazyPage(() => import("./pages/JobDetails/JobDetails.jsx"));
const ClientManagement = lazyPage(() => import("./pages/ClientManagement"));
const ClientDetails = lazyPage(() =>
  import("./pages/ClientManagement").then((m) => ({ default: m.ClientDetails }))
);
const Performance = lazyPage(() => import("./pages/Performance"));
const Calls = lazyPage(() => import("./pages/Calls"));
const LiveMap = lazyPage(() => import("./pages/LiveMap"));
const HeatMap = lazyPage(() => import("./pages/HeatMap"));
const Sources = lazyPage(() => import("./pages/SourceConfigurator"));
const Businesses = lazyPage(() =>
  import("./pages/BusinessManagement").then((m) => ({ default: m.Businesses }))
);
const AddBusiness = lazyPage(() =>
  import("./pages/BusinessManagement").then((m) => ({ default: m.AddBusiness }))
);
const BusinessDetails = lazyPage(() =>
  import("./pages/BusinessManagement").then((m) => ({ default: m.BusinessDetails }))
);
const Finance = lazyPage(() => import("./pages/Finance"));
const FinanceUsers = lazyPage(() => import("./pages/FinanceUsers"));
const Partners = lazyPage(() =>
  import("./pages/PartnerManagement").then((m) => ({ default: m.Partners }))
);
const PartnerDetails = lazyPage(() =>
  import("./pages/PartnerManagement").then((m) => ({ default: m.PartnerDetails }))
);
const SupportTickets = lazyPage(() =>
  import("./pages/SupportTickets").then((m) => ({ default: m.SupportTickets }))
);
const TicketDetails = lazyPage(() =>
  import("./pages/SupportTickets").then((m) => ({ default: m.TicketDetails }))
);
const SOSInbox = lazyPage(() => import("./pages/SOSInbox"));
const ServiceRequestsInbox = lazyPage(() => import("./pages/ServiceRequests"));
const Leads = lazyPage(() =>
  import("./pages/LeadManagement").then((m) => ({ default: m.Leads }))
);
const AddNewLead = lazyPage(() =>
  import("./pages/LeadManagement").then((m) => ({ default: m.AddNewLead }))
);
const LeadDetails = lazyPage(() =>
  import("./pages/LeadManagement").then((m) => ({ default: m.LeadDetails }))
);
const ConvertLead = lazyPage(() =>
  import("./pages/LeadManagement").then((m) => ({ default: m.ConvertLead }))
);

// Public Pages
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage.jsx";
import TermsAndConditionsPage from "./pages/TermsAndConditionsPage.jsx";
import SupportPage from "./pages/SupportPage.jsx";
import AccountDeletionPage from "./pages/AccountDeletionPage.jsx";

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
        path="/finance"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Finance />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/finance-users"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <FinanceUsers />
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
        path="/leads"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <Leads />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads/new"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <AddNewLead />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads/:id/convert"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <ConvertLead />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads/:id"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <LeadDetails />
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
      <Route path="/account-deletion" element={<AccountDeletionPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
