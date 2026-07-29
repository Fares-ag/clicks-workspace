import React from 'react';
import './DataTable.css';
import TableHeader from './TableHeader.jsx';
import TableContent from './TableContent.jsx';
import TablePagination from './TablePagination.jsx';

const DataTable = ({
  title,
  columns = [],
  data = [],
  loading = false,
  onSearch,
  onFilter,
  onEdit,
  onDelete,
  pagination = {
    current: 1,
    total: 0,
    pageSize: 10,
    onChange: () => {}
  },
  searchPlaceholder = "Search...",
  filterOptions = [],
  filterDropdown,
  filterButtonRef,
  actionIcons = [
    { type: 'edit', icon: '/icons/user.svg', handler: onEdit },
    { type: 'delete', icon: '/icons/admin.svg', handler: onDelete }
  ],
  hasBorders = false,
  filterButtonText = "Filter",
  hideFilterIcon = false
}) => {
  return (
    <div className="data-table-outer">
      <div className={`data-table${hasBorders ? ' bordered' : ''}`}>
        <TableHeader
          title={title}
          onSearch={onSearch}
          onFilter={onFilter}
          searchPlaceholder={searchPlaceholder}
          filterOptions={filterOptions}
          filterDropdown={filterDropdown}
          filterButtonRef={filterButtonRef}
          filterButtonText={filterButtonText}
          hideFilterIcon={hideFilterIcon}
        />
        <TableContent
          columns={columns}
          data={data}
          loading={loading}
          onEdit={onEdit}
          onDelete={onDelete}
          actionIcons={actionIcons}
        />
      </div>
      <div className="table-pagination-section">
        <TablePagination
          current={pagination.current}
          total={pagination.total}
          pageSize={pagination.pageSize}
          onChange={pagination.onChange}
        />
      </div>
    </div>
  );
};

export default DataTable;
