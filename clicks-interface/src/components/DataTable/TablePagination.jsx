import React from "react";
import "./DataTable.css";

const getPages = (current, total, pageSize) => {
  const totalPages = Math.ceil(total / pageSize);
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    pages.push(i);
  }
  return pages;
};

const TablePagination = ({
  current = 1,
  total = 0,
  pageSize = 10,
  onChange = () => {}
}) => {
  const pages = getPages(current, total, pageSize);

  return (
    <div className="table-pagination">
      <button
        className="pagination-btn"
        disabled={current === 1}
        onClick={() => onChange(current - 1)}
      >
        <img src="/icons/long-arrow-left.svg" alt="Prev" />
      </button>
      {pages.map((page) => (
        <button
          key={page}
          className={`pagination-page-btn${page === current ? " active" : ""}`}
          onClick={() => onChange(page)}
        >
          {page}
        </button>
      ))}
      <button
        className="pagination-btn"
        disabled={current === pages.length}
        onClick={() => onChange(current + 1)}
      >
        <img src="/icons/long-arrow-right.svg" alt="Next" />
      </button>
    </div>
  );
};

export default TablePagination;
