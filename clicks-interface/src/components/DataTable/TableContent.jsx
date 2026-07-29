import React from "react";
import "./DataTable.css";

const TableContent = ({
  columns = [],
  data = [],
  loading = false,
  onEdit,
  onDelete,
  actionIcons = [
    { type: 'edit', icon: '/icons/user.svg', handler: onEdit },
    { type: 'delete', icon: '/icons/admin.svg', handler: onDelete }
  ]
}) => {
  return (
    <div className="table-content">
      <div className="table-row table-header-row">
        {columns.map((col) => (
          <div
            key={col.key}
            className={`table-cell table-header-cell ${col.key === 'status' || col.key === 'action' ? 'table-cell-center' : ''}`}
            style={{
              background: "var(--color-bg-page)",
              color: "var(--color-text-secondary)",
              fontWeight: 500,
              fontSize: 12,
              width: col.width === 'flex' ? undefined : col.width,
              flex: col.width === 'flex' ? '1 0 0' : undefined,
              minWidth: col.width === 'flex' ? '0px' : undefined
            }}
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
          <div className="table-row" key={row._id || idx}>
            {columns.map((col) => (
              <div 
                className={`table-cell ${col.key === 'profilePhoto' || col.key === 'status' || col.key === 'action' ? 'table-cell-center' : ''}`}
                key={col.key}
                style={{
                  width: col.width === 'flex' ? undefined : col.width,
                  flex: col.width === 'flex' ? '1 0 0' : undefined,
                  minWidth: col.width === 'flex' ? '0px' : undefined
                }}
              >
                {typeof col.render === "function"
                  ? col.render(row)
                  : row[col.dataIndex]}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
};

export default TableContent;
