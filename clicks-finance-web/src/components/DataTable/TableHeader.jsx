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
        {(filterButtonText || !hideFilterIcon || filterDropdown) && (
          <div style={{ position: "relative" }}>
            <button ref={filterButtonRef} className="filter-btn" onClick={onFilter} type="button">
              {!hideFilterIcon && <img src="/icons/Filter.svg" alt="" className="filter-icon" />}
              {filterButtonText ? <span>{filterButtonText}</span> : null}
            </button>
            {filterDropdown}
          </div>
        )}
      </div>
    </div>
  );
};

export default TableHeader;
