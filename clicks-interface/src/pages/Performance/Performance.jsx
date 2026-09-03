import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGetPerformanceQuery, useLazyExportPerformanceCSVQuery } from "../../store/performanceApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import DataTable from "../../components/DataTable/DataTable.jsx";
import SuccessModal from "../../components/SuccessModal.jsx";
import "./Performance.css";

function PerformanceNameCell({ technician, navigate }) {
  return (
    <div className="performance-name-cell" onClick={() => navigate(`/technicians/${technician._id}`)}>
      <img
        src={technician.profileImage || "/icons/user.svg"}
        alt="Technician"
        className="performance-name-img"
      />
      <span className="performance-name-text">
        {technician.firstName} {technician.lastName}
      </span>
    </div>
  );
}

function Performance() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [showSuccess, setShowSuccess] = useState(false);

  const { data, isLoading } = useGetPerformanceQuery({ page, limit: 5, search: debouncedSearch });
  const [exportCSV, { isLoading: isExporting }] = useLazyExportPerformanceCSVQuery();

  const performanceData = data?.performance || [];
  const total = data?.total || 0;

  const handleExportCSV = async () => {
    try {
      const result = await exportCSV().unwrap();
      
      // Download CSV file
      const blob = new Blob([result], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `performance-report-${Date.now()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setShowSuccess(true);
    } catch (error) {
      console.error("Error exporting CSV:", error);
      alert("Failed to export CSV. Please try again.");
    }
  };

  const columns = [
    {
      title: "Name",
      key: "name",
      dataIndex: "name",
      width: "15%",
      render: (row) => (
        <PerformanceNameCell technician={row} navigate={navigate} />
      )
    },
    {
      title: "Total Earnings",
      key: "totalEarnings", 
      dataIndex: "totalEarnings",
      width: "12%",
      render: (row) => (
        <span className="performance-earnings-cell">
          QAR {row.totalEarnings.toLocaleString()}
        </span>
      )
    },
    {
      title: "Completed Jobs",
      key: "completedJobs",
      dataIndex: "completedJobs",
      width: "11%",
      render: (row) => (
        <span className="performance-jobs-cell">
          {row.completedJobs}
        </span>
      )
    },
    {
      title: "Total Online Hours",
      key: "totalOnlineHours",
      dataIndex: "totalOnlineHours",
      width: "13%",
      render: (row) => (
        <span className="performance-hours-cell">
          {row.totalOnlineHours}h
        </span>
      )
    },
    {
      title: "Ongoing Jobs", 
      key: "ongoingJobs",
      dataIndex: "ongoingJobs",
      width: "11%",
      render: (row) => (
        <span className="performance-ongoing-cell">
          {row.ongoingJobs}
        </span>
      )
    },
    {
      title: "Cash Balance",
      key: "cashBalance",
      dataIndex: "cashBalance",
      width: "12%",
      render: (row) => (
        <span className="performance-balance-cell">
          QAR {row.cashBalance.toLocaleString()}
        </span>
      )
    },
    {
      title: "Total Profit",
      key: "totalProfit", 
      dataIndex: "totalProfit",
      width: "12%",
      render: (row) => (
        <span className="performance-profit-cell">
          QAR {row.totalProfit.toLocaleString()}
        </span>
      )
    },
    {
      title: "Cancellation Rate",
      key: "cancellationRate",
      dataIndex: "cancellationRate",
      width: "14%",
      render: (row) => (
        <span className="performance-cancellation-badge">
          {row.cancellationRate}%
        </span>
      )
    }
  ];

  return (
    <div className="performance-container">
      <div className="performance-header-row">
        <span className="performance-title">
          Performance
        </span>
      </div>
      <DataTable
        columns={columns}
        data={performanceData}
        loading={isLoading}
        onSearch={(value) => setSearchInput(value)}
        onFilter={handleExportCSV}
        filterDropdown={null}
        pagination={{
          current: page,
          total: total,
          pageSize: 5,
          onChange: (newPage) => setPage(newPage)
        }}
        title="Performance"
        filterButtonText={isExporting ? "Exporting..." : "Export CSV"}
        hideFilterIcon={true}
      />
      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="CSV Exported"
        subtitle="The performance report has been exported successfully."
      />
    </div>
  );
}

export default Performance;
