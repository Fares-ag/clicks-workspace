import React, { useState } from "react";
import DataTable from "../../components/DataTable/DataTable.jsx";
import { useGetRefundsQuery } from "../../store/paymentsApi";
import { useAdminRole } from "../../utils/adminRoles";
import RefundDetailModal from "./RefundDetailModal.jsx";
import {
  REFUND_APPROVER_ROLES,
  RefundStatusBadge,
  actorLabel,
  formatDateTime,
  formatMoney,
  jobLabel,
  useCurrentAdminId,
} from "./paymentUi.jsx";
import "./Payments.css";

const FILTERS = [
  { value: "requested", label: "Awaiting approval" },
  { value: "processing", label: "Awaiting SkipCash" },
  { value: "failed", label: "Failed" },
  { value: "succeeded", label: "Refunded" },
  { value: "rejected", label: "Rejected" },
  { value: "", label: "All" },
];

const PAGE_SIZE = 20;

function Refunds() {
  const [status, setStatus] = useState("requested");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const { role } = useAdminRole();
  const myId = useCurrentAdminId();
  const { data, isLoading, isFetching, error } = useGetRefundsQuery({
    status,
    page,
    limit: PAGE_SIZE,
  });
  const refunds = data?.refunds || [];
  const approver = REFUND_APPROVER_ROLES.includes(role);

  const columns = [
    {
      title: "Job",
      key: "job",
      width: "20%",
      render: (row) => (
        <div className="pay-cell">
          <strong>{jobLabel(row)}</strong>
          {row.kind === "membership" && <span className="pay-sub">Membership</span>}
        </div>
      ),
    },
    {
      title: "Amount",
      key: "amount",
      width: "11%",
      render: (row) => <strong>{formatMoney(row.amount)}</strong>,
    },
    {
      title: "Reason",
      key: "reason",
      width: "27%",
      render: (row) => (
        <div className="pay-cell">
          <span title={row.reason}>{row.reason}</span>
          <span className="pay-sub">
            {row.source} · {row.method === "manual" ? "manual (cash/portal)" : "SkipCash"}
          </span>
        </div>
      ),
    },
    {
      title: "Requested",
      key: "requested",
      width: "20%",
      render: (row) => (
        <div className="pay-cell">
          <span>{actorLabel(row.requested_by, myId)}</span>
          <span className="pay-sub">{formatDateTime(row.createdAt)}</span>
        </div>
      ),
    },
    {
      title: "Status",
      key: "status",
      width: "22%",
      render: (row) => (
        <div className="pay-cell">
          <RefundStatusBadge status={row.status} />
          {row.status === "failed" && row.error && (
            <span className="pay-sub pay-error-text">{row.error}</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="admin-page admin-page--scroll pay-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Refunds</h1>
          <p className="pay-page-intro">
            {approver
              ? "Approve or reject cases you did not request yourself. Card refunds stay \"Awaiting SkipCash\" until SkipCash confirms; the credit note is issued then."
              : "Refund cases need a Super Admin other than the requester to approve them. Request refunds from a paid job."}
          </p>
        </div>
      </div>
      <div className="pay-chips">
        {FILTERS.map((f) => (
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
      {error && <p className="pay-error">{error?.data?.message || "Failed to load refunds"}</p>}
      <DataTable
          title="Refunds"
          hideTitle
          hideSearch
          hideFilterIcon
          columns={columns.map((c) => ({
            ...c,
            render: (row) => (
              <div className="pay-row-click" onClick={() => setOpenId(row._id)}>
                {c.render(row)}
              </div>
            ),
          }))}
          data={refunds}
          loading={isLoading}
          fetching={isFetching && !isLoading}
          pagination={{
            current: page,
            total: data?.total || 0,
            pageSize: PAGE_SIZE,
            onChange: setPage,
          }}
        />
      {openId && <RefundDetailModal refundId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

export default Refunds;
