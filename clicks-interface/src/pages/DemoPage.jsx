import React from "react";
import AdminLayout from "../components/AdminLayout.jsx";
import AdminSidebar from "../components/AdminSidebar.jsx";
import DataTable from "../components/DataTable/DataTable.jsx";
import SuccessModal from "../components/SuccessModal.jsx";
import DocumentReviewModal from "../components/DocumentReviewModal.jsx";
import SettleBalanceModal from "../components/SettleBalanceModal.jsx";
import { useState } from "react";
function DemoPage() {
  // Sample data for the DataTable demo
  const sampleColumns = [
    { key: 'name', title: 'Name', dataIndex: 'name' },
    { key: 'email', title: 'Email', dataIndex: 'email' },
    { key: 'status', title: 'Status', dataIndex: 'status' },
    { key: 'role', title: 'Role', dataIndex: 'role' },
    { key: 'joinDate', title: 'Join Date', dataIndex: 'joinDate' }
  ];

  const sampleData = [
    { _id: '1', name: 'John Smith', email: 'john.smith@example.com', status: 'Active', role: 'Technician', joinDate: '2023-01-15' },
    { _id: '2', name: 'Sarah Johnson', email: 'sarah.johnson@example.com', status: 'Active', role: 'Manager', joinDate: '2022-11-20' },
    { _id: '3', name: 'Mike Wilson', email: 'mike.wilson@example.com', status: 'Inactive', role: 'Technician', joinDate: '2023-03-10' },
    { _id: '4', name: 'Emily Davis', email: 'emily.davis@example.com', status: 'Active', role: 'Admin', joinDate: '2022-08-05' },
    { _id: '5', name: 'David Brown', email: 'david.brown@example.com', status: 'Pending', role: 'Technician', joinDate: '2023-12-01' },
    { _id: '6', name: 'Lisa Garcia', email: 'lisa.garcia@example.com', status: 'Active', role: 'Supervisor', joinDate: '2023-02-28' },
    { _id: '7', name: 'Tom Anderson', email: 'tom.anderson@example.com', status: 'Active', role: 'Technician', joinDate: '2023-06-12' },
    { _id: '8', name: 'Anna Martinez', email: 'anna.martinez@example.com', status: 'Inactive', role: 'Manager', joinDate: '2022-12-18' }
  ];

  const handleSearch = (searchTerm) => {
    console.log('Search:', searchTerm);
  };

  const handleFilter = () => {
    console.log('Filter clicked');
  };

  const handleEdit = (row) => {
    console.log('Edit:', row);
  };

  const handleDelete = (row) => {
    console.log('Delete:', row);
  };

  const handlePageChange = (page) => {
    console.log('Page changed to:', page);
  };

  const [showSuccess, setShowSuccess] = useState(false);
  const [showDocReview, setShowDocReview] = useState(false);
  const [showSettle, setShowSettle] = useState(false);

  return (
      <div style={{ padding: "32px" }}>
        <h1 className="text-large">Demo Page</h1>
        <h2 className="text-heading" style={{ marginTop: 24 }}>Typography</h2>
        <div style={{ marginBottom: 16 }}>
          <div className="text-body">Body Text (14px, 400)</div>
          <div className="text-body-medium">Medium Text (14px, 500)</div>
          <div className="text-heading">Heading (18px, 500)</div>
          <div className="text-large">Large Heading (24px, 700)</div>
          <div className="text-secondary">Secondary Text</div>
          <div className="text-error">Error Text</div>
        </div>
        <h2 className="text-heading" style={{ marginTop: 24 }}>Status Pills</h2>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <span className="status-pill status-approved">Approved</span>
          <span className="status-pill status-pending">Pending</span>
          <span className="status-pill status-rejected">Rejected</span>
          <span className="status-pill status-ongoing">Ongoing</span>
          <span className="status-pill status-completed">Completed</span>
        </div>
        <h2 className="text-heading" style={{ marginTop: 24 }}>Buttons</h2>
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          <button className="ant-btn ant-btn-primary">Primary Button</button>
          <button className="ant-btn">Default Button</button>
        </div>
        <h2 className="text-heading" style={{ marginTop: 24 }}>Cards</h2>
        <div style={{ display: "flex", gap: 24 }}>
          <div className="ant-card" style={{ width: 220, padding: 16 }}>
            <div className="ant-card-head-title">Card Title</div>
            <div className="text-body">Card content goes here.</div>
          </div>
          <div className="ant-card" style={{ width: 220, padding: 16 }}>
            <div className="ant-card-head-title">Another Card</div>
            <div className="text-body">More content here.</div>
          </div>
        </div>
        <h2 className="text-heading" style={{ marginTop: 24 }}>Theme Colors</h2>
        <div style={{ display: "flex", gap: 24, marginTop: 8 }}>
          <div style={{ background: "var(--color-primary)", color: "#fff", padding: 12, borderRadius: 6 }}>Primary</div>
          <div style={{ background: "var(--color-secondary)", color: "#252525", padding: 12, borderRadius: 6 }}>Secondary</div>
          <div style={{ background: "var(--color-bg-page)", color: "#252525", padding: 12, borderRadius: 6 }}>Page BG</div>
          <div style={{ background: "var(--color-bg-nav-highlight)", color: "#252525", padding: 12, borderRadius: 6 }}>Nav Highlight</div>
          <div style={{ background: "var(--color-bg-selection)", color: "#252525", padding: 12, borderRadius: 6 }}>Selection</div>
        </div>
        
        <h2 className="text-heading" style={{ marginTop: 24 }}>Data Table</h2>
        <div style={{ marginTop: 16 }}>
          <DataTable
            title="Sample Data Table"
            columns={sampleColumns}
            data={sampleData}
            loading={false}
            onSearch={handleSearch}
            onFilter={handleFilter}
            onEdit={handleEdit}
            onDelete={handleDelete}
            pagination={{
              current: 1,
              total: 25,
              pageSize: 5,
              onChange: handlePageChange
            }}
            searchPlaceholder="Search users..."
            actionIcons={[
              { type: 'edit', icon: '/icons/configurator.svg', handler: handleEdit },
              { type: 'delete', icon: '/icons/admin.svg', handler: handleDelete }
            ]}
          />
        </div>

        <h2 className="text-heading" style={{ marginTop: 24 }}>Modals Demo</h2>
        <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
          <button className="ant-btn ant-btn-primary" onClick={() => setShowSuccess(true)}>
            Show Success Modal
          </button>
          <button className="ant-btn" onClick={() => setShowDocReview(true)}>
            Show Document Review Modal
          </button>
        </div>
        <SuccessModal
          open={showSuccess}
          onClose={() => setShowSuccess(false)}
          title="Success!"
          subtitle="Your action was completed successfully."
        />
        <DocumentReviewModal
          open={showDocReview}
          onClose={() => setShowDocReview(false)}
          subtitle="Please review the uploaded document below."
          documentImage="/images/star.png"
          expiryDate="2025-12-31"
          onApprove={() => setShowSuccess(true)}
          onReject={() => setShowSuccess(true)}
        />
        <SettleBalanceModal
          open={showSettle}
          onClose={() => setShowSettle(false)}
          currentBalance={5000}
          onSettle={() => setShowSuccess(true)}
        />
        <div style={{ marginTop: 16 }}>
          <button className="ant-btn" onClick={() => setShowSettle(true)}>
            Show Settle Balance Modal
          </button>
        </div>
      </div>
  );
}

export default DemoPage;
