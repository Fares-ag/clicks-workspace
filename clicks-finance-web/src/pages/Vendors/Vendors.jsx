import React, { useEffect, useMemo, useState } from "react";
import DataTable from "../../components/DataTable/DataTable.jsx";
import PrimaryButton from "../../components/PrimaryButton.jsx";
import {
  useCreateVendorMutation,
  useDeleteVendorMutation,
  useListVendorsQuery,
  useUpdateVendorMutation,
} from "../../store/portalApi";
import "./Vendors.css";

const PAGE_SIZE = 10;

// Mirrors VENDOR_LIST_LIMIT in the admin API's financeVendorController: the list
// endpoint returns at most this many rows, sorted by name ascending.
const VENDOR_LIST_CAP = 500;
const SEARCH_DEBOUNCE_MS = 300;

const emptyForm = {
  name: "",
  category: "",
  contactPerson: "",
  phone: "",
  email: "",
  notes: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function VendorStatusPill({ active }) {
  return (
    <span className={`vendor-status-pill ${active ? "active" : "inactive"}`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function Vendors() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [serverSearch, setServerSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // The endpoint has no server paging but it IS capped at VENDOR_LIST_CAP rows,
  // so the typed term has to reach the server — filtering only the cached rows
  // could never find a vendor sitting past the cap. Debounced so a fast typist
  // does not fire a request per keystroke; the tab filter and the pager still
  // run on whatever came back.
  useEffect(() => {
    const handle = setTimeout(
      () => setServerSearch(searchTerm.trim().slice(0, 64)),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(handle);
  }, [searchTerm]);

  // `{}` rather than undefined so the unfiltered case shares one RTK Query cache
  // entry with the vendor dropdown on the jobs list, which asks the same way.
  const { data, error, isLoading, isFetching, refetch } = useListVendorsQuery(
    serverSearch ? { search: serverSearch } : {}
  );
  const [createVendor, { isLoading: creating }] = useCreateVendorMutation();
  const [updateVendor, { isLoading: updating }] = useUpdateVendorMutation();
  const [deleteVendor, { isLoading: deactivating }] = useDeleteVendorMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");

  const vendors = useMemo(() => data?.vendors || [], [data]);
  const busy = creating || updating || deactivating;
  const truncated = vendors.length >= VENDOR_LIST_CAP;
  const loadError = error
    ? error?.data?.message || "Could not load vendors."
    : "";

  const counts = useMemo(() => {
    const active = vendors.filter((v) => v.isActive !== false).length;
    return { all: vendors.length, active, inactive: vendors.length - active };
  }, [vendors]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return vendors.filter((v) => {
      const active = v.isActive !== false;
      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "inactive" && active) return false;
      if (!term) return true;
      return [v.name, v.category, v.contactPerson, v.phone, v.email]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(term));
    });
  }, [vendors, statusFilter, searchTerm]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const filterTabs = [
    { key: "all", label: "All", count: counts.all },
    { key: "active", label: "Active", count: counts.active },
    { key: "inactive", label: "Inactive", count: counts.inactive },
  ];

  const applyStatusFilter = (key) => {
    setStatusFilter(key);
    setCurrentPage(1);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setMessage("");
    setModalOpen(true);
  };

  const openEdit = (vendor) => {
    setEditingId(vendor._id);
    setForm({
      name: vendor.name || "",
      category: vendor.category || "",
      contactPerson: vendor.contactPerson || "",
      phone: vendor.phone || "",
      email: vendor.email || "",
      notes: vendor.notes || "",
    });
    setFormError("");
    setMessage("");
    setModalOpen(true);
  };

  const closeModal = () => {
    if (busy) return;
    setModalOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    const name = form.name.trim();
    if (!name) {
      setFormError("Vendor name is required.");
      return;
    }
    const email = form.email.trim();
    if (email && !EMAIL_RE.test(email)) {
      setFormError("Enter a valid email address.");
      return;
    }
    const payload = {
      name,
      category: form.category.trim(),
      contactPerson: form.contactPerson.trim(),
      phone: form.phone.trim(),
      email,
      notes: form.notes.trim().slice(0, 1000),
    };
    try {
      if (editingId) {
        await updateVendor({ id: editingId, ...payload }).unwrap();
        setMessage("Vendor updated.");
      } else {
        await createVendor(payload).unwrap();
        setMessage("Vendor created.");
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err?.data?.message || "Save failed.");
    }
  };

  const handleDeactivate = async (vendor) => {
    setMessage("");
    const ok = window.confirm(
      "Deactivate " +
        (vendor.name || "this vendor") +
        "? It stays attached to the cost rows that already reference it, but it can no longer be picked on new ones."
    );
    if (!ok) return;
    try {
      await deleteVendor(vendor._id).unwrap();
      setMessage("Vendor deactivated.");
    } catch (err) {
      setMessage(err?.data?.message || "Deactivate failed.");
    }
  };

  const handleReactivate = async (vendor) => {
    setMessage("");
    try {
      await updateVendor({ id: vendor._id, isActive: true }).unwrap();
      setMessage("Vendor reactivated.");
    } catch (err) {
      setMessage(err?.data?.message || "Reactivate failed.");
    }
  };

  const columns = [
    {
      title: "Vendor",
      key: "name",
      width: "26%",
      render: (row) => {
        const active = row.isActive !== false;
        return (
          <div className="vendor-name-cell">
            <div className={`vendor-name${active ? "" : " inactive"}`}>
              {row.name || "—"}
              {row.category ? (
                <span className="vendor-category-tag">{row.category}</span>
              ) : null}
            </div>
            {row.notes ? (
              <div className="vendor-notes" title={row.notes}>
                {row.notes}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      title: "Contact person",
      key: "contactPerson",
      width: "16%",
      render: (row) => (
        <span className="vendor-text">{row.contactPerson || "—"}</span>
      ),
    },
    {
      title: "Phone",
      key: "phone",
      width: "15%",
      render: (row) => <span className="vendor-text">{row.phone || "—"}</span>,
    },
    {
      title: "Email",
      key: "email",
      width: "20%",
      render: (row) => (
        <span className="vendor-text vendor-email">{row.email || "—"}</span>
      ),
    },
    {
      title: "Status",
      key: "isActive",
      width: "11%",
      render: (row) => <VendorStatusPill active={row.isActive !== false} />,
    },
    {
      title: "Actions",
      key: "actions",
      width: "12%",
      align: "center",
      render: (row) => (
        <div className="vendor-actions">
          <button
            type="button"
            className="vendor-action-btn"
            onClick={() => openEdit(row)}
            disabled={busy}
          >
            Edit
          </button>
          {row.isActive !== false ? (
            <button
              type="button"
              className="vendor-action-btn danger"
              onClick={() => handleDeactivate(row)}
              disabled={busy}
            >
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              className="vendor-action-btn"
              onClick={() => handleReactivate(row)}
              disabled={busy}
            >
              Reactivate
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="vendors-container">
      <div className="vendors-header-row">
        <div className="vendors-header-copy">
          <h1 className="vendors-title">Vendors</h1>
          <p className="vendors-subtitle">
            {counts.all.toLocaleString()} vendor{counts.all === 1 ? "" : "s"}
            {" · "}
            {counts.active.toLocaleString()} active
            {" · "}
            {counts.inactive.toLocaleString()} inactive
          </p>
        </div>
        <div className="vendors-header-actions">
          <div
            className="vendors-filter-tabs"
            role="tablist"
            aria-label="Vendor status filter"
          >
            {filterTabs.map((tab) => {
              const active = tab.key === statusFilter;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`vendors-filter-tab${active ? " active" : ""}`}
                  onClick={() => applyStatusFilter(tab.key)}
                >
                  {tab.label}
                  <span className="vendors-filter-count">{tab.count}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="vendors-add-btn"
            onClick={openCreate}
            disabled={busy}
          >
            <span aria-hidden="true">+</span>
            Add vendor
          </button>
        </div>
      </div>

      {loadError ? (
        <p className="vendors-message vendors-message--error" role="alert">
          {loadError}
          <button
            type="button"
            className="vendors-message-retry"
            onClick={() => refetch()}
          >
            Retry
          </button>
        </p>
      ) : null}

      {truncated ? (
        <p className="vendors-message vendors-message--warn">
          Showing the first {VENDOR_LIST_CAP.toLocaleString()} vendors by name.
          Search to reach the rest — the term is sent to the server.
        </p>
      ) : null}

      {message ? <p className="vendors-message">{message}</p> : null}

      <DataTable
        title={
          isFetching && !isLoading ? "Vendor list · refreshing…" : "Vendor list"
        }
        columns={columns}
        data={pageRows}
        loading={isLoading}
        onSearch={(value) => {
          setSearchTerm(value);
          setCurrentPage(1);
        }}
        searchPlaceholder="Search name, category, contact…"
        hideFilterIcon
        filterButtonText=""
        pagination={{
          current: safePage,
          total: filtered.length,
          pageSize: PAGE_SIZE,
          onChange: setCurrentPage,
        }}
      />

      {modalOpen && (
        <div
          className="vendors-modal-backdrop"
          role="presentation"
          onClick={closeModal}
        >
          <form
            className="vendors-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <h2 className="vendors-modal-title">
              {editingId ? "Edit vendor" : "Add vendor"}
            </h2>

            <div className="vendors-form-grid">
              <div className="vendors-form-group">
                <label htmlFor="vendor-name">Name *</label>
                <input
                  id="vendor-name"
                  value={form.name}
                  maxLength={200}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="vendors-form-group">
                <label htmlFor="vendor-category">Category</label>
                <input
                  id="vendor-category"
                  value={form.category}
                  maxLength={100}
                  placeholder="Parts, towing, tyres…"
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                />
              </div>
              <div className="vendors-form-group">
                <label htmlFor="vendor-contact">Contact person</label>
                <input
                  id="vendor-contact"
                  value={form.contactPerson}
                  maxLength={100}
                  onChange={(e) =>
                    setForm({ ...form, contactPerson: e.target.value })
                  }
                />
              </div>
              <div className="vendors-form-group">
                <label htmlFor="vendor-phone">Phone</label>
                <input
                  id="vendor-phone"
                  value={form.phone}
                  maxLength={30}
                  placeholder="+974…"
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="vendors-form-group vendors-form-group--full">
                <label htmlFor="vendor-email">Email</label>
                <input
                  id="vendor-email"
                  type="email"
                  value={form.email}
                  maxLength={200}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="vendors-form-group vendors-form-group--full">
                <label htmlFor="vendor-notes">Notes</label>
                <textarea
                  id="vendor-notes"
                  rows={3}
                  value={form.notes}
                  maxLength={1000}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
                <span className="vendors-form-hint">
                  {form.notes.length}/1000
                </span>
              </div>
            </div>

            {formError ? <p className="vendors-form-error">{formError}</p> : null}

            <div className="vendors-modal-actions">
              <button
                type="button"
                className="vendors-cancel-btn"
                onClick={closeModal}
                disabled={busy}
              >
                Cancel
              </button>
              <PrimaryButton type="submit" width="160px" disabled={busy}>
                {creating || updating
                  ? "Saving…"
                  : editingId
                  ? "Save changes"
                  : "Create vendor"}
              </PrimaryButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default Vendors;
