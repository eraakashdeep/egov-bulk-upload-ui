import React, { useCallback, useEffect, useState } from 'react';
import { getEmployees } from '../api/client';
import type { EmployeesResponse } from '../types';

interface EmployeeDirectoryProps {
  refreshSignal: number;
}

export const EmployeeDirectory: React.FC<EmployeeDirectoryProps> = ({ refreshSignal }) => {
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [data, setData] = useState<EmployeesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (targetPage: number, targetSize: number, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getEmployees(targetPage, targetSize, signal);
        setData(res);
        if (res.page !== targetPage) {
          setPage(res.page);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load employees.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchPage(page, pageSize, controller.signal);
    return () => controller.abort();
  }, [page, pageSize, refreshSignal, fetchPage]);

  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <section className="card" aria-labelledby="employees-heading">
      <div className="card-header">
        <div>
          <h2 id="employees-heading">Employee Directory</h2>
          <p className="muted">
            Server-paginated records from <code>GET /employees</code>.{' '}
            {data ? `${total.toLocaleString()} total employees.` : ''}
          </p>
        </div>

        <div className="action-row">
          <label className="inline-label">
            Rows per page
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>

          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => void fetchPage(page, pageSize)}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Date of Joining</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={7} className="muted center-cell">
                  Loading employees...
                </td>
              </tr>
            ) : data && data.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted center-cell">
                  No employees found.
                </td>
              </tr>
            ) : (
              data?.items.map((emp) => (
                <tr key={emp.employee_id}>
                  <td>
                    <code>{emp.employee_id}</code>
                  </td>
                  <td>
                    {emp.first_name} {emp.last_name}
                  </td>
                  <td>{emp.email}</td>
                  <td>{emp.department}</td>
                  <td>{emp.designation || '—'}</td>
                  <td>{emp.date_of_joining}</td>
                  <td>{emp.phone || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination-bar">
        <span className="muted">
          Page <strong>{page}</strong> of <strong>{totalPages}</strong> (
          {total.toLocaleString()} records)
        </span>
        <div className="action-row">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={loading || page <= 1}
            onClick={() => setPage(1)}
          >
            First
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={loading || page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={loading || page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            disabled={loading || page >= totalPages}
            onClick={() => setPage(totalPages)}
          >
            Last
          </button>
        </div>
      </div>
    </section>
  );
};
