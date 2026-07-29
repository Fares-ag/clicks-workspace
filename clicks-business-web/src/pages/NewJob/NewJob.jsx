import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  useCreateJobMutation,
  useLazyVehicleModelsQuery,
  useVehicleMakesQuery,
} from "../../store/portalApi";
import {
  DEFAULT_COUNTRY_CODE,
  isValidLocalPhone,
  toLocalDigits,
} from "../../utils/phone";
import "./NewJob.css";

const JOB_TYPES = ["Tires", "Engines", "Gearbox"];

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function NewJob() {
  const navigate = useNavigate();
  const { data: makesData } = useVehicleMakesQuery();
  const [fetchModels] = useLazyVehicleModelsQuery();
  const [createJob, { isLoading }] = useCreateJobMutation();

  const makes = makesData?.makes || [];
  const [models, setModels] = useState([]);
  const [useFreeTextVehicle, setUseFreeTextVehicle] = useState(false);

  const [form, setForm] = useState({
    clientName: "",
    clientMobileNumber: "",
    clientEmail: "",
    vehicleMake: "",
    vehicleModel: "",
    otherModel: "",
    vehicleYear: "",
    licensePlate: "",
    vinNumber: "",
    issue: "",
    location: "",
    jobType: "",
    price: "",
    dateTime: toLocalInputValue(new Date()),
  });
  const [phoneError, setPhoneError] = useState("");
  const [formError, setFormError] = useState("");
  const [locating, setLocating] = useState(false);

  const selectedMakeId = useMemo(() => {
    const match = makes.find((m) => m.makeName === form.vehicleMake);
    return match?._id || "";
  }, [makes, form.vehicleMake]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormError("");
  };

  const onPhoneChange = (value) => {
    const local = toLocalDigits(value);
    setField("clientMobileNumber", local);
    if (local && !isValidLocalPhone(local)) {
      setPhoneError("Enter the 8-digit local number (without +974)");
    } else {
      setPhoneError("");
    }
  };

  const onMakeChange = async (makeName) => {
    setForm((prev) => ({
      ...prev,
      vehicleMake: makeName,
      vehicleModel: "",
      otherModel: "",
    }));
    setModels([]);
    const make = makes.find((m) => m.makeName === makeName);
    if (!make?._id) return;
    try {
      const res = await fetchModels(make._id).unwrap();
      setModels(res?.models || []);
    } catch {
      setModels([]);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setFormError("Geolocation is not supported in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        setField("location", `${lat}, ${lng}`);
        setLocating(false);
      },
      (err) => {
        setFormError(err.message || "Could not get location");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    const local = toLocalDigits(form.clientMobileNumber);
    if (!form.clientName.trim()) {
      setFormError("Customer name is required");
      return;
    }
    if (!isValidLocalPhone(local)) {
      setPhoneError("Phone number must be exactly 8 digits (without country code)");
      setFormError("Phone number must be exactly 8 digits (without country code)");
      return;
    }
    if (!form.issue.trim()) {
      setFormError("Issue description is mandatory");
      return;
    }
    if (!form.location.trim()) {
      setFormError("Location is required");
      return;
    }
    if (!form.jobType) {
      setFormError("Job type is required");
      return;
    }
    if (form.price === "" || Number.isNaN(Number(form.price))) {
      setFormError("Price is required");
      return;
    }
    if (!form.dateTime) {
      setFormError("Date and time are required");
      return;
    }

    const make = form.vehicleMake.trim();
    const model =
      form.vehicleModel === "Other"
        ? form.otherModel.trim()
        : form.vehicleModel.trim();
    if (!make || !model) {
      setFormError("Vehicle make and model are required");
      return;
    }

    const year = form.vehicleYear ? Number(form.vehicleYear) : undefined;
    const payload = {
      clientName: form.clientName.trim(),
      clientMobileNumber: local,
      countryCode: DEFAULT_COUNTRY_CODE,
      ...(form.clientEmail.trim()
        ? { clientEmail: form.clientEmail.trim() }
        : {}),
      vehicleMake: make,
      vehicleModel: model,
      ...(year ? { vehicleYear: year } : {}),
      ...(form.licensePlate.trim()
        ? { licensePlate: form.licensePlate.trim() }
        : {}),
      ...(form.vinNumber.trim() ? { vinNumber: form.vinNumber.trim() } : {}),
      issue: form.issue.trim(),
      location: form.location.trim(),
      jobType: form.jobType,
      price: Number(form.price),
      dateTime: new Date(form.dateTime).toISOString(),
    };

    try {
      const res = await createJob(payload).unwrap();
      const id = res?.job?._id || res?._id;
      if (id) navigate(`/jobs/${id}`, { replace: true });
      else navigate("/", { replace: true });
    } catch (err) {
      setFormError(
        err?.data?.message || err?.error || "Failed to create job"
      );
    }
  };

  const showCatalog = makes.length > 0 && !useFreeTextVehicle;

  return (
    <div className="new-job admin-page">
      <div className="admin-page-header">
        <div>
          <Link to="/jobs" className="back-link">
            ← Back to jobs
          </Link>
          <h1 className="admin-page-title">New Job</h1>
          <p className="admin-page-subtitle">
            Create a roadside assistance job for a customer.
          </p>
        </div>
      </div>

      <form className="new-job-form" onSubmit={handleSubmit}>
        <section className="form-card">
          <h2>Customer</h2>
          <div className="form-grid">
            <label className="field">
              <span>Name*</span>
              <input
                value={form.clientName}
                onChange={(e) => setField("clientName", e.target.value)}
                placeholder="Customer name"
              />
            </label>
            <label className="field">
              <span>Phone* (+974)</span>
              <input
                value={form.clientMobileNumber}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="8-digit local number"
                inputMode="numeric"
              />
              {phoneError && <em className="field-error">{phoneError}</em>}
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={form.clientEmail}
                onChange={(e) => setField("clientEmail", e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
        </section>

        <section className="form-card">
          <div className="form-card-header-row">
            <h2>Vehicle</h2>
            {makes.length > 0 && (
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setUseFreeTextVehicle((v) => !v);
                  setField("vehicleMake", "");
                  setField("vehicleModel", "");
                  setField("otherModel", "");
                  setModels([]);
                }}
              >
                {useFreeTextVehicle ? "Use catalog" : "Enter manually"}
              </button>
            )}
          </div>
          <div className="form-grid">
            {showCatalog ? (
              <>
                <label className="field">
                  <span>Make*</span>
                  <select
                    value={form.vehicleMake}
                    onChange={(e) => onMakeChange(e.target.value)}
                  >
                    <option value="">Select make</option>
                    {makes.map((m) => (
                      <option key={m._id} value={m.makeName}>
                        {m.makeName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Model*</span>
                  <select
                    value={form.vehicleModel}
                    onChange={(e) => setField("vehicleModel", e.target.value)}
                    disabled={!selectedMakeId}
                  >
                    <option value="">Select model</option>
                    {models.map((m) => (
                      <option key={m._id} value={m.modelName}>
                        {m.modelName}
                      </option>
                    ))}
                    <option value="Other">Other</option>
                  </select>
                </label>
                {form.vehicleModel === "Other" && (
                  <label className="field">
                    <span>Other model*</span>
                    <input
                      value={form.otherModel}
                      onChange={(e) => setField("otherModel", e.target.value)}
                      placeholder="Model name"
                    />
                  </label>
                )}
              </>
            ) : (
              <>
                <label className="field">
                  <span>Make*</span>
                  <input
                    value={form.vehicleMake}
                    onChange={(e) => setField("vehicleMake", e.target.value)}
                    placeholder="Make"
                  />
                </label>
                <label className="field">
                  <span>Model*</span>
                  <input
                    value={form.vehicleModel}
                    onChange={(e) => setField("vehicleModel", e.target.value)}
                    placeholder="Model"
                  />
                </label>
              </>
            )}
            <label className="field">
              <span>Year</span>
              <input
                value={form.vehicleYear}
                onChange={(e) => setField("vehicleYear", e.target.value)}
                placeholder="e.g. 2022"
                inputMode="numeric"
              />
            </label>
            <label className="field">
              <span>License plate</span>
              <input
                value={form.licensePlate}
                onChange={(e) => setField("licensePlate", e.target.value)}
              />
            </label>
            <label className="field">
              <span>VIN</span>
              <input
                value={form.vinNumber}
                onChange={(e) => setField("vinNumber", e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="form-card">
          <h2>Job</h2>
          <div className="form-grid">
            <label className="field">
              <span>Type*</span>
              <select
                value={form.jobType}
                onChange={(e) => setField("jobType", e.target.value)}
              >
                <option value="">Select type</option>
                {JOB_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Price (QAR)*</span>
              <input
                value={form.price}
                onChange={(e) => setField("price", e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </label>
            <label className="field">
              <span>Date & time*</span>
              <input
                type="datetime-local"
                value={form.dateTime}
                onChange={(e) => setField("dateTime", e.target.value)}
              />
            </label>
            <label className="field field-span-2">
              <span>Issue*</span>
              <textarea
                rows={3}
                value={form.issue}
                onChange={(e) => setField("issue", e.target.value)}
                placeholder="Describe the issue"
              />
            </label>
            <label className="field field-span-2">
              <span>Location*</span>
              <div className="location-row">
                <input
                  value={form.location}
                  onChange={(e) => setField("location", e.target.value)}
                  placeholder="Address or lat, lng"
                />
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={useCurrentLocation}
                  disabled={locating}
                >
                  {locating ? "Locating…" : "Use current location"}
                </button>
              </div>
            </label>
          </div>
        </section>

        {formError && <div className="form-banner-error">{formError}</div>}

        <div className="form-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => navigate("/jobs")}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? "Creating…" : "Create job"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default NewJob;
