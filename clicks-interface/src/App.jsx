import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";

// Auth — keep eager for fast login
import Login from "./pages/Login.jsx";

// Layout & Protection — AdminLayout is lazy so login does not download antd / socket.io
import ProtectedRoute from "./components/ProtectedRoute.jsx";
const AdminLayout = lazyPage(() => import("./components/AdminLayout.jsx"));

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

// Import each page file directly so barrel index.js files do not pull sibling
// pages (e.g. VehicleMakes + VehicleInsurance) into the same chunk.
const Dashboard = lazyPage(() => import("./pages/Dashboard/Dashboard.jsx"));
const AdminManagement = lazyPage(() => import("./pages/AdminManagement/AdminManagement.jsx"));
const AdminDetails = lazyPage(() => import("./pages/AdminManagement/AdminDetails.jsx"));
const Technicians = lazyPage(() => import("./pages/TechnicianManagement/Technicians.jsx"));
const TechnicianDetails = lazyPage(() => import("./pages/TechnicianManagement/TechnicianDetails.jsx"));
const Vehicles = lazyPage(() => import("./pages/VehicleManagement/Vehicles.jsx"));
const VehicleDetails = lazyPage(() => import("./pages/VehicleManagement/VehicleDetails.jsx"));
const VehicleMakes = lazyPage(() => import("./pages/VehicleManagement/VehicleMakes.jsx"));
const VehicleModels = lazyPage(() => import("./pages/VehicleManagement/VehicleModels.jsx"));
const Jobs = lazyPage(() => import("./pages/JobManagement/Jobs.jsx"));
const AddNewJob = lazyPage(() => import("./pages/JobManagement/AddNewJob.jsx"));
const JobDetails = lazyPage(() => import("./pages/JobDetails/JobDetails.jsx"));
const ClientManagement = lazyPage(() => import("./pages/ClientManagement/ClientManagement.jsx"));
const ClientDetails = lazyPage(() => import("./pages/ClientManagement/ClientDetails.jsx"));
const Performance = lazyPage(() => import("./pages/Performance/Performance.jsx"));
const Calls = lazyPage(() => import("./pages/Calls/Calls.jsx"));
const LiveMap = lazyPage(() => import("./pages/LiveMap/LiveMap.jsx"));
const HeatMap = lazyPage(() => import("./pages/HeatMap/HeatMap.jsx"));
const Sources = lazyPage(() => import("./pages/SourceConfigurator/Sources.jsx"));
const Businesses = lazyPage(() => import("./pages/BusinessManagement/Businesses.jsx"));
const AddBusiness = lazyPage(() => import("./pages/BusinessManagement/AddBusiness.jsx"));
const BusinessDetails = lazyPage(() => import("./pages/BusinessManagement/BusinessDetails.jsx"));
const Finance = lazyPage(() => import("./pages/Finance/Finance.jsx"));
const FinanceUsers = lazyPage(() => import("./pages/FinanceUsers/FinanceUsers.jsx"));
const Partners = lazyPage(() => import("./pages/PartnerManagement/Partners.jsx"));
const PartnerDetails = lazyPage(() => import("./pages/PartnerManagement/PartnerDetails.jsx"));
const TechnicianLogs = lazyPage(() => import("./pages/TechnicianLogs/TechnicianLogs.jsx"));
const SupportTickets = lazyPage(() => import("./pages/SupportTickets/SupportTickets.jsx"));
const TicketDetails = lazyPage(() => import("./pages/SupportTickets/TicketDetails.jsx"));
const SOSInbox = lazyPage(() => import("./pages/SOSInbox/SOSInbox.jsx"));
const ServiceRequestsInbox = lazyPage(() => import("./pages/ServiceRequests/ServiceRequestsInbox.jsx"));
const Leads = lazyPage(() => import("./pages/LeadManagement/Leads.jsx"));
const AddNewLead = lazyPage(() => import("./pages/LeadManagement/AddNewLead.jsx"));
const LeadDetails = lazyPage(() => import("./pages/LeadManagement/LeadDetails.jsx"));
const ConvertLead = lazyPage(() => import("./pages/LeadManagement/ConvertLead.jsx"));

const PrivacyPolicyPage = lazyPage(() => import("./pages/PrivacyPolicyPage.jsx"));
const TermsAndConditionsPage = lazyPage(() => import("./pages/TermsAndConditionsPage.jsx"));
const SupportPage = lazyPage(() => import("./pages/SupportPage.jsx"));
const AccountDeletionPage = lazyPage(() => import("./pages/AccountDeletionPage.jsx"));

function AdminShell() {
  return (
    <ProtectedRoute>
      <AdminLayout />
    </ProtectedRoute>
  );
}

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
      <Route element={<AdminShell />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin-management" element={<AdminManagement />} />
        <Route path="/admin-management/:id" element={<AdminDetails />} />
        <Route path="/live-map" element={<LiveMap />} />
        <Route path="/heat-map" element={<HeatMap />} />
        <Route path="/clients" element={<ClientManagement />} />
        <Route path="/clients/:id" element={<ClientDetails />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/calls" element={<Calls />} />
        <Route path="/vehicle-makes" element={<VehicleMakes />} />
        <Route path="/vehicle-models" element={<VehicleModels />} />
        <Route path="/technicians" element={<Technicians />} />
        <Route path="/technicians/:id" element={<TechnicianDetails />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/vehicles/:id" element={<VehicleDetails />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/businesses" element={<Businesses />} />
        <Route path="/businesses/new" element={<AddBusiness />} />
        <Route path="/businesses/:id" element={<BusinessDetails />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/finance-users" element={<FinanceUsers />} />
        <Route path="/partners" element={<Partners />} />
        <Route path="/partners/:id" element={<PartnerDetails />} />
        <Route path="/jobs" element={<Jobs />} />
        <Route path="/jobs/new" element={<AddNewJob />} />
        <Route path="/jobs/:id" element={<JobDetails />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/new" element={<AddNewLead />} />
        <Route path="/leads/:id/convert" element={<ConvertLead />} />
        <Route path="/leads/:id" element={<LeadDetails />} />
        <Route path="/sos" element={<SOSInbox />} />
        <Route path="/service-requests" element={<ServiceRequestsInbox />} />
        <Route path="/technician-logs" element={<TechnicianLogs />} />
        <Route path="/support-tickets" element={<SupportTickets />} />
        <Route path="/support-tickets/:id" element={<TicketDetails />} />
      </Route>
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
