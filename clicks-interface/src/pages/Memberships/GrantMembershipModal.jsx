import React, { useEffect, useMemo, useState } from "react";
import { useGetMembershipPlansQuery } from "../../store/membershipPlanApi";
import {
  useGetCustomerGarageQuery,
  useGetCustomerVehiclesQuery,
  useGrantMembershipMutation,
} from "../../store/customerMembershipApi";
import { apiError, vehicleLabel } from "./membershipUi.jsx";

function GrantMembershipModal({ customerId, onClose, onGranted }) {
  const [term, setTerm] = useState("");
  const [vehicle, setVehicle] = useState(null);
  const [planId, setPlanId] = useState("");
  const [interval, setInterval] = useState("month");
  const [months, setMonths] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const { data: plansData } = useGetMembershipPlansQuery();
  const plans = plansData?.plans || [];
  const [grant, { isLoading }] = useGrantMembershipMutation();

  const skipSearch = Boolean(customerId) || term.trim().length < 2;
  const { data: searchData, isFetching: searching } = useGetCustomerVehiclesQuery(
    { search: term.trim(), limit: 20 },
    { skip: skipSearch }
  );
  const { data: garageData, isLoading: garageLoading } = useGetCustomerGarageQuery(customerId, {
    skip: !customerId,
  });

  const vehicles = customerId ? garageData?.vehicles || [] : searchData?.vehicles || [];

  useEffect(() => {
    if (!vehicle && vehicles.length === 1) setVehicle(vehicles[0]);
  }, [vehicles, vehicle]);
  const selectedPlan = plans.find((p) => p.id === planId || p._id === planId);
  const intervals = useMemo(() => {
    const list = (selectedPlan?.intervals || []).map((r) => r.interval);
    return list.length ? list : ["month", "year"];
  }, [selectedPlan]);

  function pickVehicle(v) {
    setVehicle(v);
    setError("");
  }

  function pickPlan(id) {
    setPlanId(id);
    const plan = plans.find((p) => p.id === id || p._id === id);
    const first = plan?.intervals?.[0]?.interval;
    if (first) setInterval(first);
  }

  async function submit() {
    setError("");
    if (!vehicle?.id) {
      setError("Pick a vehicle");
      return;
    }
    if (!planId) {
      setError("Pick a package");
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required");
      return;
    }
    try {
      await grant({
        customer_vehicle_id: vehicle.id,
        plan_id: planId,
        interval,
        ...(months.trim() ? { months: Number(months) } : {}),
        reason: reason.trim(),
      }).unwrap();
      onGranted?.();
    } catch (err) {
      setError(apiError(err, "Could not grant membership"));
    }
  }

  return (
    <div className="confirmation-modal-backdrop" role="presentation">
      <div className="confirmation-modal pay-modal pay-modal--wide mp-modal" role="dialog" aria-modal="true">
        <button className="confirmation-modal-close" onClick={onClose} aria-label="Close">
          <span className="confirmation-modal-close-x">&#10005;</span>
        </button>
        <div className="pay-modal-body">
          <div className="confirmation-modal-title">Grant membership</div>
          <p className="pay-hint">Complimentary — no payment. The vehicle cannot already have an active membership.</p>

          {!customerId && (
            <div className="pay-field">
              <span className="pay-field-label">Find vehicle (phone or plate)</span>
              <input
                type="search"
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setVehicle(null);
                }}
                placeholder="e.g. 50011111 or ABC123"
              />
            </div>
          )}

          <div className="mp-vehicle-list">
            {(searching || garageLoading) && <p className="pay-hint">Searching…</p>}
            {!searching && !garageLoading && vehicles.length === 0 && (customerId || term.trim().length >= 2) && (
              <p className="pay-hint">No vehicles found.</p>
            )}
            {vehicles.map((v) => (
              <button
                type="button"
                key={v.id}
                className={`mp-vehicle${vehicle?.id === v.id ? " on" : ""}`}
                onClick={() => pickVehicle(v)}
              >
                <strong>{vehicleLabel(v)}</strong>
                <span className="pay-sub">{v.customer ? `${v.customer.name} · ${v.customer.phone}` : ""}</span>
              </button>
            ))}
          </div>

          {vehicle && (
            <>
              <div className="pay-field">
                <span className="pay-field-label">Package</span>
                <select value={planId} onChange={(e) => pickPlan(e.target.value)}>
                  <option value="">Select a package</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name_en}
                      {p.active === false ? " (off sale)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mp-grid">
                <div className="pay-field">
                  <span className="pay-field-label">Interval</span>
                  <select value={interval} onChange={(e) => setInterval(e.target.value)}>
                    {intervals.map((i) => (
                      <option key={i} value={i}>
                        {i === "year" ? "Yearly" : "Monthly"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pay-field">
                  <span className="pay-field-label">
                    Months <span className="pay-optional">(empty = plan length)</span>
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={months}
                    onChange={(e) => setMonths(e.target.value)}
                  />
                </div>
              </div>
              <div className="pay-field">
                <span className="pay-field-label">Reason (required)</span>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Launch goodwill"
                />
              </div>
            </>
          )}

          {error && <p className="pay-error">{error}</p>}

          <div className="confirmation-modal-actions">
            <button className="confirmation-modal-cancel" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button className="confirmation-modal-confirm" onClick={submit} disabled={isLoading}>
              {isLoading ? "Granting…" : "Grant"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GrantMembershipModal;
