import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGetBusinessesQuery } from "../../store/businessApi";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import "./Businesses.css";

function formatCut(business) {
  const type = business.cutType === "profit" ? "Profit" : "Revenue";
  const pct = business.cutPercent ?? 0;
  return `${type} ${pct}%`;
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return "—";
  }
}

function Businesses() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 400);
  const [activeFilter, setActiveFilter] = useState("all");

  const queryArgs = useMemo(() => {
    const args = { page: 1, limit: 100, search: debouncedSearch.trim() };
    if (activeFilter === "active") args.isActive = true;
    if (activeFilter === "inactive") args.isActive = false;
    return args;
  }, [debouncedSearch, activeFilter]);

  const { data, isLoading, isFetching, error } = useGetBusinessesQuery(queryArgs);
  const businesses = data?.businesses || [];

  return (
    <div className="biz-container">
      <div className="biz-header-row">
        <h1 className="biz-title">Business Management</h1>
        <div className="biz-header-actions">
          <div className="biz-search">
            <img src="/icons/Search.svg" alt="" width={16} height={16} />
            <input
              type="text"
              placeholder="Search businesses"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="biz-filter">
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <button
            type="button"
            className="biz-add-btn"
            onClick={() => navigate("/businesses/new")}
          >
            <span>+</span>
            Add business
          </button>
        </div>
      </div>

      <div className="biz-table-wrap">
        {isLoading || isFetching ? (
          <div className="biz-loading">Loading businesses…</div>
        ) : error ? (
          <div className="biz-empty">
            Failed to load businesses. Full admin access is required.
          </div>
        ) : businesses.length === 0 ? (
          <div className="biz-empty">No businesses found</div>
        ) : (
          <table className="biz-table responsive-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Cut</th>
                <th>Users</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b._id} onClick={() => navigate(`/businesses/${b._id}`)}>
                  <td data-label="Name">
                    <div className="biz-name">{b.name}</div>
                  </td>
                  <td data-label="Contact">
                    <div>{b.phone || "—"}</div>
                    <div className="biz-muted">{b.email || ""}</div>
                  </td>
                  <td data-label="Cut">{formatCut(b)}</td>
                  <td data-label="Users">{b.userCount ?? "—"}</td>
                  <td data-label="Status">
                    <span
                      className={`biz-badge ${b.isActive === false ? "inactive" : "active"}`}
                    >
                      {b.isActive === false ? "Inactive" : "Active"}
                    </span>
                  </td>
                  <td data-label="Created" className="biz-muted">{formatDate(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Businesses;
