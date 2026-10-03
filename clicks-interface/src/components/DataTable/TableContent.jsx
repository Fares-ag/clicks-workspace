import React, { useMemo } from "react";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import "./DataTable.css";

function getCellValue(col, row) {
  if (typeof col.render === "function") return col.render(row);
  if (col.dataIndex) return row[col.dataIndex];
  return row[col.key];
}

function getMobileCellValue(col, row) {
  if (typeof col.mobileRender === "function") return col.mobileRender(row);
  return getCellValue(col, row);
}

function isEmptyCellValue(value) {
  return value === null || value === undefined || value === "" || value === "—";
}

function sortColumnsForMobile(columns) {
  return columns
    .map((col, index) => ({ col, index }))
    .filter(({ col }) => !col.mobile?.hide)
    .sort((a, b) => {
      const orderA = a.col.mobile?.order ?? a.index;
      const orderB = b.col.mobile?.order ?? b.index;
      if (orderA !== orderB) return orderA - orderB;
      return a.index - b.index;
    })
    .map(({ col }) => col);
}

function isActionColumn(col) {
  return col.key === "action" || col.key === "actions";
}

function getColumnStyle(col) {
  if (col.width === "flex") {
    return { flex: "1 1 0", minWidth: 0 };
  }
  if (typeof col.width === "string" && col.width.endsWith("px")) {
    return { flex: "0 0 auto", width: col.width };
  }
  return {
    flex: `1 1 ${col.width}`,
    minWidth: 0,
  };
}

const TableContent = ({
  columns = [],
  data = [],
  loading = false,
  fetching = false,
  onEdit,
  onDelete,
  actionIcons = [
    { type: "edit", icon: "/icons/user.svg", handler: onEdit },
    { type: "delete", icon: "/icons/admin.svg", handler: onDelete },
  ],
}) => {
  const isMobile = useIsMobile();
  const mobileColumns = useMemo(
    () => sortColumnsForMobile(columns),
    [columns]
  );

  const featuredColumns = mobileColumns.filter((col) => col.mobile?.featured);
  const bodyColumns = mobileColumns.filter(
    (col) => !col.mobile?.featured && !isActionColumn(col)
  );
  const actionColumns = mobileColumns.filter(isActionColumn);

  const renderDesktop = () => (
    <>
      <div className="table-row table-header-row table-row--desktop">
        {columns.map((col) => (
          <div
            key={col.key}
            className={`table-cell table-header-cell ${
              col.key === "status" || col.key === "action" || col.key === "actions"
                ? "table-cell-center"
                : ""
            }`}
            style={getColumnStyle(col)}
          >
            {col.title}
          </div>
        ))}
      </div>
      {loading ? (
        <div className="table-loading">Loading...</div>
      ) : data.length === 0 ? (
        <div className="table-empty-state">
          <img src="/icons/empty.svg" alt="No data" className="table-empty-icon" />
          <p className="table-empty-text">No records found</p>
        </div>
      ) : (
        data.map((row, idx) => (
          <div className="table-row table-row--desktop" key={row._id || idx}>
            {columns.map((col) => (
              <div
                className={`table-cell ${
                  col.key === "profilePhoto" ||
                  col.key === "status" ||
                  col.key === "action" ||
                  col.key === "actions" ||
                  col.key === "whatsapp"
                    ? "table-cell-center"
                    : ""
                }`}
                key={col.key}
                style={getColumnStyle(col)}
              >
                {getCellValue(col, row)}
              </div>
            ))}
          </div>
        ))
      )}
    </>
  );

  const renderMobileCards = () => {
    if (loading) {
      return <div className="table-loading">Loading...</div>;
    }
    if (data.length === 0) {
      return (
        <div className="table-empty-state">
          <img src="/icons/empty.svg" alt="No data" className="table-empty-icon" />
          <p className="table-empty-text">No records found</p>
        </div>
      );
    }

    return (
      <div className="table-cards" role="list">
        {data.map((row, idx) => (
          <article className="table-card" key={row._id || idx} role="listitem">
            {featuredColumns.length > 0 ? (
              <div className="table-card-featured">
                {featuredColumns.map((col) => (
                  <div className="table-card-featured-item" key={col.key}>
                    {getCellValue(col, row)}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="table-card-body">
              {bodyColumns.map((col) => {
                const value = getCellValue(col, row);
                if (isEmptyCellValue(value)) return null;
                const label = col.mobile?.label ?? col.title;
                return (
                  <div className="table-card-field" key={col.key}>
                    <span className="table-card-label">{label}</span>
                    <div className="table-card-value">{value}</div>
                  </div>
                );
              })}
            </div>
            {actionColumns.length > 0 ? (
              <div className="table-card-actions">
                {actionColumns.map((col) => (
                  <div className="table-card-action-item" key={col.key}>
                    {getMobileCellValue(col, row)}
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    );
  };

  return (
    <div className={`table-content${isMobile ? " table-content--mobile" : ""}`}>
      {fetching ? <div className="table-fetching-bar" aria-hidden="true" /> : null}
      {isMobile ? renderMobileCards() : renderDesktop()}
    </div>
  );
};

export default TableContent;
