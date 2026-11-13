import React, { useState } from "react";
import DataTable from "../../components/DataTable/DataTable.jsx";
import PrimaryButton from "../../components/PrimaryButton.jsx";
import { useGetCustomerMembershipsQuery } from "../../store/customerMembershipApi";
import GrantMembershipModal from "./GrantMembershipModal.jsx";
import MembershipDetailModal from "./MembershipDetailModal.jsx";
import {
  MEMBERSHIP_FILTERS,
  MembershipStatusBadge,
  customerLabel,
  formatDate,
  plateLabel,
} from "./membershipUi.jsx";
import "../../components/ConfirmationModal.css";
import "../Payments/Payments.css";
import "./Memberships.css";

const PAGE_SIZE = 20;

function CustomerMemberships() {
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const [granting, setGranting] = useState(false);
  const { data, isLoading, isFetching, error } = useGetCustomerMembershipsQuery({
    status,
    page,
    limit: PAGE_SIZE,
    search,
  });
  const rows = data?.subscriptions || [];

  const columns = [
    {
      title: "Customer",
      key: "customer",
      width: "22%",
      render: (row) => (
        <div className="pay-cell">
          <strong>{customerLabel(row)}</strong>
          <span className="pay-sub">{row.customer?.phone || ""}</span>
        </div>
      ),
    },
    {
      title: "Plate",
      key: "plate",
      width: "12%",
      render: (row) => <span>{plateLabel(row)}</span>,
    },
    {
      title: "Package",
      key: "plan",
      width: "18%",
      render: (row) => (
        <div className="pay-cell">
          <strong>{row.planName || row.planCode || "—"}</strong>
          <span className="pay-sub">{row.interval === "year" ? "Yearly" : "Monthly"}</span>
        </div>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: "16%",
      render: (row) => (
        <div className="pay-cell">
          <MembershipStatusBadge status={row.status} />
          {row.comp && <span className="pay-sub">comp</span>}
          {row.cancel_at_period_end && <span className="pay-sub">ends at period end</span>}
        </div>
      ),
    },
    {
      title: "Ends",
      key: "end",
      width: "14%",
      render: (row) => <span>{formatDate(row.endDate)}</span>,
    },
  ];

  return (
    <div className="admin-page admin-page--scroll pay-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Customer Memberships</h1>
          <p className="pay-page-intro">
            Live memberships on customer vehicles. Grant complimentary cover, extend, cancel, or
            open a refund for finance to approve.
          </p>
        </div>
        <PrimaryButton width="200px" onClick={() => setGranting(true)}>
          Grant membership
        </PrimaryButton>
      </div>
      <div className="pay-chips">
        {MEMBERSHIP_FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            className={`pay-chip${status === f.value ? " active" : ""}`}
            onClick={() => {
              setStatus(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error && <p className="pay-error">{error?.data?.message || "Failed to load memberships"}</p>}
      <DataTable
        title="Customer Memberships"
        hideTitle
        hideFilterIcon
        searchPlaceholder="Search plan, phone or plate"
        searchValue={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        columns={columns.map((c) => ({
          ...c,
          render: (row) => (
            <div className="pay-row-click" onClick={() => setOpenId(row.id || row._id)}>
              {c.render(row)}
            </div>
          ),
        }))}
        data={rows}
        loading={isLoading}
        fetching={isFetching && !isLoading}
        pagination={{
          current: page,
          total: data?.total || 0,
          pageSize: PAGE_SIZE,
          onChange: setPage,
        }}
      />
      {openId && <MembershipDetailModal membershipId={openId} onClose={() => setOpenId(null)} />}
      {granting && (
        <GrantMembershipModal
          onClose={() => setGranting(false)}
          onGranted={() => setGranting(false)}
        />
      )}
    </div>
  );
}

export default CustomerMemberships;
