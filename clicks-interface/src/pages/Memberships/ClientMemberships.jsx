import React, { useState } from "react";
import { useAdminRole } from "../../utils/adminRoles";
import {
  useGetCustomerGarageQuery,
  useGetCustomerMembershipsQuery,
} from "../../store/customerMembershipApi";
import GrantMembershipModal from "./GrantMembershipModal.jsx";
import MembershipDetailModal from "./MembershipDetailModal.jsx";
import {
  MembershipStatusBadge,
  formatDate,
  plateLabel,
  vehicleLabel,
} from "./membershipUi.jsx";
import "../../components/ConfirmationModal.css";
import "../Payments/Payments.css";
import "./Memberships.css";

function membershipForVehicle(memberships, vehicleId) {
  return memberships.find(
    (m) =>
      (m.vehicle?.id || m.customer_vehicle_id) === vehicleId &&
      (m.status === "active" || m.status === "pending_payment")
  );
}

function ClientMemberships({ customerId }) {
  const { isFullAdmin } = useAdminRole();
  const [openId, setOpenId] = useState(null);
  const [granting, setGranting] = useState(false);
  const { data: garageData, isLoading: garageLoading } = useGetCustomerGarageQuery(customerId, {
    skip: !isFullAdmin || !customerId,
  });
  const { data: memData, isLoading: memLoading } = useGetCustomerMembershipsQuery(
    { customer_id: customerId, limit: 50 },
    { skip: !isFullAdmin || !customerId }
  );

  if (!isFullAdmin) return null;

  const vehicles = garageData?.vehicles || [];
  const memberships = memData?.subscriptions || [];
  const loading = garageLoading || memLoading;

  return (
    <div className="client-details-section">
      <div className="mp-client-head">
        <h3 className="client-details-section-title">Memberships</h3>
        <button type="button" className="pay-small-btn" onClick={() => setGranting(true)}>
          Grant membership
        </button>
      </div>
      {loading && <div className="client-details-value">Loading memberships…</div>}
      {!loading && vehicles.length === 0 && memberships.length === 0 && (
        <div className="client-details-value">No vehicles on this account.</div>
      )}
      {!loading && vehicles.length > 0 && (
        <div className="mp-client-list">
          {vehicles.map((v) => {
            const live = membershipForVehicle(memberships, v.id);
            return (
              <button
                type="button"
                key={v.id}
                className="mp-client-row"
                onClick={() => live && setOpenId(live.id || live._id)}
                disabled={!live}
              >
                <div className="pay-cell">
                  <strong>{vehicleLabel(v)}</strong>
                  <span className="pay-sub">{v.plate || "No plate"}</span>
                </div>
                {live ? (
                  <div className="pay-cell mp-client-status">
                    <MembershipStatusBadge status={live.status} />
                    <span className="pay-sub">
                      {live.planName} · until {formatDate(live.endDate)}
                    </span>
                  </div>
                ) : (
                  <span className="pay-sub">No active membership</span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {!loading && memberships.length > 0 && (
        <>
          <h4 className="mp-section">All memberships</h4>
          <ul className="mp-client-history">
            {memberships.map((m) => (
              <li key={m.id || m._id}>
                <button type="button" className="mp-client-history-btn" onClick={() => setOpenId(m.id || m._id)}>
                  <MembershipStatusBadge status={m.status} />
                  <span>
                    {m.planName || m.planCode} · {plateLabel(m)} · {formatDate(m.endDate)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {openId && <MembershipDetailModal membershipId={openId} onClose={() => setOpenId(null)} />}
      {granting && (
        <GrantMembershipModal
          customerId={customerId}
          onClose={() => setGranting(false)}
          onGranted={() => setGranting(false)}
        />
      )}
    </div>
  );
}

export default ClientMemberships;
