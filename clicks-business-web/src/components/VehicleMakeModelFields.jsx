import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  useLazyVehicleModelsQuery,
  useVehicleMakesQuery,
} from "../store/portalApi";
import "./VehicleMakeModelFields.css";

function filterItems(items, query) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const starts = items.filter((item) => item.toLowerCase().startsWith(q));
  const contains = items.filter(
    (item) =>
      !item.toLowerCase().startsWith(q) && item.toLowerCase().includes(q)
  );
  return [...starts, ...contains];
}

function bestMatch(items, query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = items.find((item) => item.toLowerCase() === q);
  if (exact) return exact;
  const starts = items.filter((item) => item.toLowerCase().startsWith(q));
  if (starts.length === 1) return starts[0];
  return null;
}

function VehicleCombobox({
  label,
  value,
  onChange,
  options,
  disabled = false,
  placeholder = "Type to search or scroll",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const rootRef = useRef(null);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(
    () => filterItems(options, query),
    [options, query]
  );

  const commit = (next) => {
    const trimmed = next.trim();
    const match = bestMatch(options, trimmed);
    const resolved = match || trimmed;
    setQuery(resolved);
    onChange(resolved);
    setOpen(false);
  };

  return (
    <div className="add-new-job-field vehicle-combobox" ref={rootRef}>
      <label>{label}</label>
      <div className="vehicle-combobox-input-wrap">
        <input
          type="text"
          value={query}
          disabled={disabled}
          placeholder={disabled ? "Enter make first" : placeholder}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(query);
            }
            if (e.key === "Escape") setOpen(false);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (query.trim()) commit(query);
            }, 120);
          }}
        />
        <button
          type="button"
          className="vehicle-combobox-toggle"
          disabled={disabled}
          aria-label="Show all options"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => !disabled && setOpen((prev) => !prev)}
        >
          ▾
        </button>
      </div>
      {open && !disabled && (
        <div className="vehicle-combobox-options">
          {filtered.length === 0 ? (
            <div className="vehicle-combobox-empty">
              No matches — press Enter to use typed value
            </div>
          ) : (
            filtered.map((option) => (
              <button
                key={option}
                type="button"
                className={`vehicle-combobox-option${
                  option === value ? " selected" : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(option)}
              >
                {option}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function VehicleMakeModelFields({
  make,
  model,
  otherModel,
  onMakeChange,
  onModelChange,
  onOtherModelChange,
}) {
  const { data: makesData, isLoading: makesLoading } = useVehicleMakesQuery();
  const [fetchModels] = useLazyVehicleModelsQuery();
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const makes = makesData?.makes || [];
  const makeNames = useMemo(
    () => makes.map((item) => item.makeName).filter(Boolean),
    [makes]
  );
  const modelNames = useMemo(() => {
    const names = models.map((item) => item.modelName).filter(Boolean);
    if (!names.includes("Other")) names.push("Other");
    return names;
  }, [models]);

  const selectedMake = makes.find((item) => item.makeName === make);
  const useCatalog = makeNames.length > 0;
  const showCatalogModels = Boolean(selectedMake && models.length > 0);

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      if (!selectedMake?._id) {
        setModels([]);
        return;
      }
      setModelsLoading(true);
      try {
        const res = await fetchModels(selectedMake._id).unwrap();
        if (!cancelled) setModels(res?.models || []);
      } catch {
        if (!cancelled) setModels([]);
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    }

    loadModels();
    return () => {
      cancelled = true;
    };
  }, [selectedMake?._id, fetchModels]);

  if (makesLoading) {
    return <div className="vehicle-catalog-loading">Loading vehicle catalog…</div>;
  }

  if (!useCatalog) {
    return (
      <>
        <div className="add-new-job-field">
          <label>Vehicle Make*</label>
          <input
            type="text"
            value={make}
            onChange={(e) => onMakeChange(e.target.value)}
            placeholder="Enter make"
          />
        </div>
        <div className="add-new-job-field">
          <label>Vehicle Model*</label>
          <input
            type="text"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="Enter model"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <VehicleCombobox
        label="Vehicle Make*"
        value={make}
        options={makeNames}
        onChange={(value) => {
          onMakeChange(value);
          onModelChange("");
          onOtherModelChange("");
          if (!makeNames.includes(value.trim())) {
            setModels([]);
          }
        }}
      />
      {modelsLoading ? (
        <div className="add-new-job-field vehicle-catalog-loading">Loading models…</div>
      ) : showCatalogModels ? (
        <VehicleCombobox
          label="Vehicle Model*"
          value={model}
          options={modelNames}
          disabled={!make.trim()}
          placeholder={make.trim() ? "Type to search or scroll" : "Enter make first"}
          onChange={(value) => {
            onModelChange(value);
            if (value !== "Other") onOtherModelChange("");
          }}
        />
      ) : (
        <div className="add-new-job-field">
          <label>Vehicle Model*</label>
          <input
            type="text"
            value={model}
            disabled={!make.trim()}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder={make.trim() ? "Enter model" : "Enter make first"}
          />
        </div>
      )}
      {model === "Other" ? (
        <div className="add-new-job-field">
          <label>Specify model*</label>
          <input
            type="text"
            value={otherModel}
            onChange={(e) => onOtherModelChange(e.target.value)}
            placeholder="Model name"
          />
        </div>
      ) : null}
    </>
  );
}

export default VehicleMakeModelFields;
