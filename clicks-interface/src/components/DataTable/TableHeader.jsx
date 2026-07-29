import React from "react";
import "./DataTable.css";

const TableHeader = ({
  title,
  onSearch,
  onFilter,
  searchPlaceholder,
  filterOptions,
  filterDropdown,
  filterButtonRef,
  filterButtonText = "Filter",
  hideFilterIcon = false
}) => {
  return (
    <div className="table-header">
      <div className="table-title">{title}</div>
      <div className="table-controls">
        <div className="search-bar">
          <img src="/icons/Search.svg" alt="Search" className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder={searchPlaceholder}
            onChange={e => onSearch && onSearch(e.target.value)}
          />
        </div>
        <div style={{ position: "relative" }}>
          <button ref={filterButtonRef} className="filter-btn" onClick={onFilter}>
            {!hideFilterIcon && <img src="/icons/Filter.svg" alt="Filter" className="filter-icon" />}
            <span>{filterButtonText}</span>
          </button>
          {filterDropdown}
        </div>
      </div>
    </div>
  );
};

export default TableHeader;
