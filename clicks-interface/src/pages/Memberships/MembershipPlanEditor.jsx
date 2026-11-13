import React, { useMemo, useState } from "react";
import {
  useCreateMembershipPlanMutation,
  useUpdateMembershipPlanMutation,
} from "../../store/membershipPlanApi";
import {
  INTERVALS,
  emptyIncluded,
  formToPayload,
  planToForm,
  serviceOptions,
  validatePlanForm,
} from "./planForm.js";

function ServicePicker({ options, selected, onChange, emergency = [] }) {
  const toggle = (name) =>
    onChange(selected.includes(name) ? selected.filter((t) => t !== name) : [...selected, name]);
  return (
    <div className="mp-services">
      {options.map((name) => (
        <label key={name} className={`mp-service${selected.includes(name) ? " on" : ""}`}>
          <input type="checkbox" checked={selected.includes(name)} onChange={() => toggle(name)} />
          {name}
          {emergency.includes(name) && <span className="mp-tag">emergency</span>}
        </label>
      ))}
    </div>
  );
}

function BillingOption({ label, row, onChange, options, emergency }) {
  const set = (patch) => onChange({ ...row, ...patch });
  const setIncluded = (idx, patch) =>
    set({ included: row.included.map((inc, i) => (i === idx ? { ...inc, ...patch } : inc)) });

  return (
    <section className={`mp-billing${row.enabled ? "" : " off"}`}>
      <label className="mp-switch">
        <input
          type="checkbox"
          checked={row.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        <strong>Offer {label.toLowerCase()} billing</strong>
      </label>
      {row.enabled && (
        <>
          <div className="mp-grid">
            <div className="pay-field">
              <span className="pay-field-label">Price (QAR)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={row.priceQar}
                onChange={(e) => set({ priceQar: e.target.value })}
              />
            </div>
            <div className="pay-field">
              <span className="pay-field-label">Length (months)</span>
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                value={row.durationMonths}
                onChange={(e) => set({ durationMonths: e.target.value })}
              />
            </div>
          </div>
          <div className="mp-included-head">
            <div>
              <span className="pay-field-label">Included services</span>
              <p className="pay-hint">
                Free for members, up to the quantity. Leave empty if they only get the discount.
              </p>
            </div>
          </div>
          {row.included.map((inc, idx) => (
            <div key={inc.id} className="mp-included">
              <div className="mp-included-top">
                <button
                  type="button"
                  className="mp-text-btn"
                  onClick={() => set({ included: row.included.filter((_, i) => i !== idx) })}
                >
                  Remove
                </button>
              </div>
              <div className="mp-included-row">
                <div className="pay-field mp-included-qty">
                  <span className="pay-field-label">Quantity</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={inc.quota}
                    onChange={(e) => setIncluded(idx, { quota: e.target.value })}
                  />
                </div>
                <div className="pay-field">
                  <span className="pay-field-label">
                    Counter name <span className="pay-optional">(optional)</span>
                  </span>
                  <input
                    type="text"
                    placeholder="e.g. wash"
                    value={inc.bucket}
                    onChange={(e) => setIncluded(idx, { bucket: e.target.value })}
                  />
                </div>
              </div>
              <span className="pay-field-hint">
                Any of the ticked services uses up this quantity. Leave the counter name empty
                unless a member's usage history already relies on it.
              </span>
              <ServicePicker
                options={options}
                selected={inc.serviceTypes}
                emergency={emergency}
                onChange={(serviceTypes) => setIncluded(idx, { serviceTypes })}
              />
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary pay-small-btn mp-add"
            onClick={() => set({ included: [...row.included, emptyIncluded()] })}
          >
            + Add included service
          </button>
        </>
      )}
    </section>
  );
}

/** Create or edit one membership package. */
function MembershipPlanEditor({ plan, meta, nextSortOrder = 0, onClose, onSaved }) {
  const isNew = !plan;
  const [form, setForm] = useState(() => planToForm(plan, meta, nextSortOrder));
  const [serverErrors, setServerErrors] = useState([]);
  const [showErrors, setShowErrors] = useState(false);
  const [createPlan, { isLoading: creating }] = useCreateMembershipPlanMutation();
  const [updatePlan, { isLoading: updating }] = useUpdateMembershipPlanMutation();
  const saving = creating || updating;

  const options = useMemo(() => serviceOptions(meta, form), [meta, form]);
  const emergency = meta?.emergencyServiceTypes || [];
  const errors = validatePlanForm(form, meta?.limits);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setBilling = (key, row) =>
    setForm((f) => ({ ...f, intervals: { ...f.intervals, [key]: row } }));

  const members = plan?.activeMembers || 0;
  const emergencyChanged = !isNew && form.coversEmergency !== (plan.coversEmergency === true);
  const codeChanged = !isNew && form.code.trim().toLowerCase() !== plan.code;

  async function save() {
    setShowErrors(true);
    setServerErrors([]);
    if (errors.length) return;
    const body = formToPayload(form);
    try {
      const res = isNew
        ? await createPlan(body).unwrap()
        : await updatePlan({ id: plan.id, ...body }).unwrap();
      onSaved?.(res.plan);
    } catch (err) {
      const data = err?.data || {};
      setServerErrors(data.errors?.length ? data.errors : [data.message || "Could not save the package"]);
    }
  }

  const shownErrors = [...(showErrors ? errors : []), ...serverErrors];

  return (
    <div className="confirmation-modal-backdrop" role="presentation">
      <div className="confirmation-modal pay-modal pay-modal--wide mp-modal" role="dialog" aria-modal="true">
        <div className="mp-modal-head">
          <div className="confirmation-modal-title">
            {isNew ? "New membership package" : `Edit ${plan.name_en}`}
          </div>
          <button className="confirmation-modal-close" onClick={onClose} aria-label="Close">
            <span className="confirmation-modal-close-x">&#10005;</span>
          </button>
        </div>
        <div className="mp-modal-body">
          {!isNew && members > 0 && (
            <div className="pay-banner pay-banner--info">
              {members === 1 ? "1 active member keeps" : `${members} active members keep`} the
              price, discount and included services they bought. Changes apply to new purchases.
            </div>
          )}

          <h3 className="mp-section">Package</h3>
          <div className="mp-grid">
            <div className="pay-field">
              <span className="pay-field-label">Name (English)</span>
              <input type="text" value={form.name_en} onChange={(e) => set({ name_en: e.target.value })} />
            </div>
            <div className="pay-field">
              <span className="pay-field-label">
                Name (Arabic) <span className="pay-optional">(shown in the Arabic app)</span>
              </span>
              <input
                type="text"
                dir="rtl"
                value={form.name_ar}
                onChange={(e) => set({ name_ar: e.target.value })}
              />
            </div>
            <div className="pay-field">
              <span className="pay-field-label">Code</span>
              <input
                type="text"
                placeholder="e.g. gold"
                value={form.code}
                onChange={(e) => set({ code: e.target.value })}
              />
              <span className="pay-field-hint">Internal id, lowercase. Not shown to customers.</span>
            </div>
            <div className="pay-field">
              <span className="pay-field-label">Order in the app</span>
              <input
                type="number"
                step="1"
                value={form.sortOrder}
                onChange={(e) => set({ sortOrder: e.target.value })}
              />
              <span className="pay-field-hint">Lower numbers are listed first.</span>
            </div>
          </div>
          {codeChanged && (
            <p className="pay-hint">
              Existing memberships keep the old code in their records; reports filtered by code will
              show both.
            </p>
          )}
          <label className="mp-switch">
            <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
            <strong>On sale in the customer app</strong>
          </label>
          <p className="pay-hint">
            Taking a package off sale hides it from customers. Existing members keep their membership until
            it ends.
          </p>

          <h3 className="mp-section">Discount</h3>
          <div className="pay-field mp-field-narrow">
            <span className="pay-field-label">Discount (%)</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={form.discountPercent}
              onChange={(e) => set({ discountPercent: e.target.value })}
            />
          </div>
          <ServicePicker
            options={options}
            selected={form.eligibleServiceTypes}
            emergency={emergency}
            onChange={(eligibleServiceTypes) => set({ eligibleServiceTypes })}
          />
          <label className="mp-switch">
            <input
              type="checkbox"
              checked={form.coversEmergency}
              onChange={(e) => set({ coversEmergency: e.target.checked })}
            />
            <strong>Membership also covers emergency services (SOS, towing, jump start, breakdown)</strong>
          </label>
          <p className="pay-hint">
            Off by default: emergency jobs are charged in full even for members.
          </p>
          {emergencyChanged && members > 0 && (
            <div className="pay-banner pay-banner--pending">
              Unlike the other settings, this applies to the {members} existing member
              {members === 1 ? "" : "s"} immediately (except memberships with their own override).
            </div>
          )}

          <h3 className="mp-section">Billing options</h3>
          {INTERVALS.map(({ key, label }) => (
            <BillingOption
              key={key}
              label={label}
              row={form.intervals[key]}
              options={options}
              emergency={emergency}
              onChange={(row) => setBilling(key, row)}
            />
          ))}

          {shownErrors.length > 0 && (
            <ul className="pay-error mp-errors">
              {shownErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="confirmation-modal-actions mp-modal-foot">
          <button className="confirmation-modal-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="confirmation-modal-confirm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : isNew ? "Create package" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MembershipPlanEditor;
