import React from "react";
import "./DataTable.css";

/**
 * Returns page numbers with ellipsis for large datasets.
 * Example: [1, "ellipsis", 2382, 2383, 2384, 2385, 2386, "ellipsis", 2410]
 */
const getPageItems = (current, totalPages) => {
  if (totalPages <= 0) return [];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set([1, totalPages, current]);
  for (let i = current - 2; i <= current + 2; i++) {
    if (i >= 1 && i <= totalPages) pages.add(i);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const items = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      items.push("ellipsis");
    }
    items.push(sorted[i]);
  }
  return items;
};

const TablePagination = ({
  current = 1,
  total = 0,
  pageSize = 10,
  onChange = () => {},
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safeCurrent = Math.min(Math.max(current, 1), totalPages);
  const pageItems = getPageItems(safeCurrent, totalPages);

  if (total === 0) return null;

  return (
    <div className="table-pagination">
      <button
        type="button"
        className="pagination-btn"
        disabled={safeCurrent <= 1}
        onClick={() => onChange(safeCurrent - 1)}
        aria-label="Previous page"
      >
        <img src="/icons/long-arrow-left.svg" alt="" />
      </button>
      {pageItems.map((item, index) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="pagination-ellipsis" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={`pagination-page-btn${item === safeCurrent ? " active" : ""}`}
            onClick={() => onChange(item)}
            aria-label={`Page ${item}`}
            aria-current={item === safeCurrent ? "page" : undefined}
          >
            {item}
          </button>
        )
      )}
      <button
        type="button"
        className="pagination-btn"
        disabled={safeCurrent >= totalPages}
        onClick={() => onChange(safeCurrent + 1)}
        aria-label="Next page"
      >
        <img src="/icons/long-arrow-right.svg" alt="" />
      </button>
    </div>
  );
};

export default TablePagination;
