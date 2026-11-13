import React, { useState } from "react";
import DataTable from "../../components/DataTable/DataTable.jsx";
import PrimaryButton from "../../components/PrimaryButton.jsx";
import {
  useGetMembershipPlanMetaQuery,
  useGetMembershipPlansQuery,
  useUpdateMembershipPlanMutation,
} from "../../store/membershipPlanApi";
import MembershipPlanEditor from "./MembershipPlanEditor.jsx";
import { INTERVALS, includedSummary, priceSummary } from "./planForm.js";
import "../../components/ConfirmationModal.css";
import "../Payments/Payments.css";
import "./Memberships.css";

/** Full-admin: the membership packages customers can buy. */
function MembershipPlans() {
  const { data, isLoading, isFetching, error } = useGetMembershipPlansQuery();
  const { data: meta } = useGetMembershipPlanMetaQuery();
  const [updatePlan] = useUpdateMembershipPlanMutation();
  const [editing, setEditing] = useState(null); // plan | "new" | null
  const [toggling, setToggling] = useState(null);
  const [toggleError, setToggleError] = useState("");
  const plans = data?.plans || [];

  async function toggleActive(plan) {
    const next = !plan.active;
    if (
      !next &&
      !window.confirm(
        `Take "${plan.name_en}" off sale? Customers will no longer see it. ` +
          `${plan.activeMembers || 0} active member(s) keep their membership until it ends.`
      )
    ) {
      return;
    }
    setToggleError("");
    setToggling(plan.id);
    try {
      await updatePlan({ id: plan.id, active: next }).unwrap();
    } catch (err) {
      setToggleError(err?.data?.message || "Could not change the package");
    } finally {
      setToggling(null);
    }
  }

  const columns = [
    {
      title: "Package",
      key: "name",
      width: "20%",
      render: (row) => (
        <div className="pay-cell">
          <strong>{row.name_en}</strong>
          <span className="pay-sub">
            {row.name_ar ? `${row.name_ar} · ` : ""}
            {row.code}
          </span>
        </div>
      ),
    },
    {
      title: "Price",
      key: "price",
      width: "20%",
      render: (row) => <span>{priceSummary(row)}</span>,
    },
    {
      title: "Included",
      key: "included",
      width: "26%",
      render: (row) => (
        <div className="pay-cell">
          {INTERVALS.map(({ key, label }) => {
            const interval = (row.intervals || []).find((r) => r.interval === key);
            return interval ? (
              <span key={key} className="pay-sub">
                {label}: {includedSummary(interval)}
              </span>
            ) : null;
          })}
        </div>
      ),
    },
    {
      title: "Discount",
      key: "discount",
      width: "12%",
      render: (row) => (
        <div className="pay-cell">
          <span>{row.discountPercent}%</span>
          {row.coversEmergency && <span className="pay-sub">incl. emergency</span>}
        </div>
      ),
    },
    {
      title: "Members",
      key: "members",
      width: "9%",
      render: (row) => <span>{row.activeMembers ?? "—"}</span>,
    },
    {
      title: "Status",
      key: "status",
      width: "13%",
      render: (row) => (
        <div className="mp-status">
          <span className={`pay-badge pay-badge--${row.active ? "success" : "muted"}`}>
            {row.active ? "On sale" : "Off sale"}
          </span>
          <button
            type="button"
            className="pay-link-btn"
            disabled={toggling === row.id}
            onClick={(e) => {
              e.stopPropagation();
              toggleActive(row);
            }}
          >
            {row.active ? "Take off sale" : "Put on sale"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="admin-page admin-page--scroll pay-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Membership Packages</h1>
          <p className="pay-page-intro">
            The packages customers can buy in the app. Edits apply to new purchases; members keep
            what they bought.
          </p>
        </div>
        <PrimaryButton width="180px" onClick={() => setEditing("new")}>
          New package
        </PrimaryButton>
      </div>
      {error && <p className="pay-error">{error?.data?.message || "Failed to load packages"}</p>}
      {toggleError && <p className="pay-error">{toggleError}</p>}
      <DataTable
        title="Membership Packages"
        hideTitle
        hideSearch
        hideFilterIcon
        columns={columns.map((c) => ({
          ...c,
          render: (row) => (
            <div className="pay-row-click" onClick={() => setEditing(row)}>
              {c.render(row)}
            </div>
          ),
        }))}
        data={plans}
        loading={isLoading}
        fetching={isFetching && !isLoading}
        pagination={{ current: 1, total: plans.length, pageSize: 100, onChange: () => {} }}
      />
      {editing && (
        <MembershipPlanEditor
          key={editing === "new" ? "new" : editing.id}
          plan={editing === "new" ? null : editing}
          meta={meta}
          nextSortOrder={plans.reduce((m, p) => Math.max(m, Number(p.sortOrder) || 0), 0) + 1}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
    </div>
  );
}

export default MembershipPlans;
