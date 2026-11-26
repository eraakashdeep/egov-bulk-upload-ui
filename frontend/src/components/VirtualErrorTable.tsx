import React, { useMemo, useRef, useState } from 'react';
import type { UploadErrorItem } from '../types';
import {
  buildErrorReportCsv,
  downloadCsvContent,
  toSpreadsheetRow,
} from '../utils/rowMapping';

interface VirtualErrorTableProps {
  jobId: string;
  errors: UploadErrorItem[];
  loading: boolean;
  loadError: string | null;
}

const ROW_HEIGHT = 44;
const VIEWPORT_HEIGHT = 440;
const OVERSCAN = 8;

export const VirtualErrorTable: React.FC<VirtualErrorTableProps> = ({
  jobId,
  errors,
  loading,
  loadError,
}) => {
  const [typeFilter, setTypeFilter] = useState<'all' | 'rejected' | 'duplicate'>('all');
  const [codeFilter, setCodeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [scrollTop, setScrollTop] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const availableCodes = useMemo(() => {
    const set = new Set<string>();
    for (const item of errors) {
      if (item.code) set.add(item.code);
    }
    return Array.from(set).sort();
  }, [errors]);

  const filteredErrors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return errors.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (codeFilter !== 'all' && item.code !== codeFilter) return false;
      if (q) {
        const spreadsheetRowStr = String(toSpreadsheetRow(item.row));
        const haystack =
          `${spreadsheetRowStr} ${item.employee_id} ${item.field} ${item.code} ${item.reason}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [errors, typeFilter, codeFilter, searchQuery]);

  const isFiltered =
    typeFilter !== 'all' || codeFilter !== 'all' || searchQuery.trim() !== '';

  const totalHeight = filteredErrors.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(filteredErrors.length, startIndex + visibleCount);
  const visibleItems = filteredErrors.slice(startIndex, endIndex);
  const offsetY = startIndex * ROW_HEIGHT;

  const resetScroll = () => {
    setScrollTop(0);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  };

  const handleDownloadAll = () => {
    const csv = buildErrorReportCsv(errors);
    downloadCsvContent(`errors-${jobId}-spreadsheet-rows.csv`, csv);
  };

  const handleDownloadFiltered = () => {
    const csv = buildErrorReportCsv(filteredErrors);
    downloadCsvContent(`errors-${jobId}-filtered-rows.csv`, csv);
  };

  return (
    <section className="card" aria-labelledby="errors-heading">
      <div className="card-header">
        <div>
          <h2 id="errors-heading">Error Report ({errors.length.toLocaleString()})</h2>
          <p className="muted">
            Row numbers match your spreadsheet (Row 1 = header, Row 2 = first employee record).
          </p>
        </div>

        <div className="action-row">
          <button
            type="button"
            className="btn btn--primary"
            disabled={errors.length === 0 || loading}
            onClick={handleDownloadAll}
          >
            Download Error Report (CSV)
          </button>
          {isFiltered && filteredErrors.length > 0 && (
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleDownloadFiltered}
            >
              Download Filtered ({filteredErrors.length.toLocaleString()})
            </button>
          )}
        </div>
      </div>

      {loading && <p className="muted">Loading detailed error rows...</p>}

      {loadError && (
        <div className="alert alert--error" role="alert">
          {loadError}
        </div>
      )}

      {!loading && !loadError && errors.length === 0 && (
        <div className="alert alert--success">
          Zero errors found! Every row in this upload passed validation.
        </div>
      )}

      {!loading && !loadError && errors.length > 0 && (
        <>
          <div className="filter-bar">
            <label className="filter-field">
              <span>Type</span>
              <select
                aria-label="Filter by error type"
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as 'all' | 'rejected' | 'duplicate');
                  resetScroll();
                }}
              >
                <option value="all">All ({errors.length.toLocaleString()})</option>
                <option value="rejected">Rejected</option>
                <option value="duplicate">Duplicate</option>
              </select>
            </label>

            <label className="filter-field">
              <span>Error Code</span>
              <select
                aria-label="Filter by error code"
                value={codeFilter}
                onChange={(e) => {
                  setCodeFilter(e.target.value);
                  resetScroll();
                }}
              >
                <option value="all">All codes</option>
                {availableCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>

            <label className="filter-field filter-field--grow">
              <span>Search row #, employee ID, field, or reason</span>
              <input
                type="search"
                placeholder="e.g. 245, EMP-00120, email, 10 digits..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  resetScroll();
                }}
              />
            </label>

            {isFiltered && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => {
                  setTypeFilter('all');
                  setCodeFilter('all');
                  setSearchQuery('');
                  resetScroll();
                }}
              >
                Clear filters
              </button>
            )}
          </div>

          <p className="muted small-note">
            Showing <strong>{filteredErrors.length.toLocaleString()}</strong> of{' '}
            <strong>{errors.length.toLocaleString()}</strong> error rows
          </p>

          {filteredErrors.length === 0 ? (
            <p className="muted empty-state">No error rows match the current filters.</p>
          ) : (
            <div className="virtual-table-shell">
              <div className="virtual-table-header" role="row">
                <div className="vt-col vt-col--row">Spreadsheet Row</div>
                <div className="vt-col vt-col--emp">Employee ID</div>
                <div className="vt-col vt-col--type">Type</div>
                <div className="vt-col vt-col--field">Field</div>
                <div className="vt-col vt-col--code">Code</div>
                <div className="vt-col vt-col--reason">Reason</div>
              </div>

              <div
                ref={scrollRef}
                className="virtual-table-viewport"
                data-testid="virtual-error-viewport"
                style={{ height: VIEWPORT_HEIGHT }}
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              >
                <div style={{ height: totalHeight, position: 'relative' }}>
                  <div
                    style={{
                      transform: `translateY(${offsetY}px)`,
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                    }}
                  >
                    {visibleItems.map((item) => {
                      const spreadsheetRow = toSpreadsheetRow(item.row);
                      return (
                        <div
                          key={`${item.row}-${item.code}-${item.employee_id}`}
                          className="virtual-table-row"
                          style={{ height: ROW_HEIGHT }}
                          role="row"
                        >
                          <div className="vt-col vt-col--row" title={`Server data index: ${item.row}`}>
                            <strong>#{spreadsheetRow}</strong>
                          </div>
                          <div className="vt-col vt-col--emp">
                            <code>{item.employee_id || '—'}</code>
                          </div>
                          <div className="vt-col vt-col--type">
                            <span
                              className={`badge badge--${
                                item.type === 'duplicate' ? 'warning' : 'danger'
                              }`}
                            >
                              {item.type}
                            </span>
                          </div>
                          <div className="vt-col vt-col--field">{item.field}</div>
                          <div className="vt-col vt-col--code">
                            <code>{item.code}</code>
                          </div>
                          <div className="vt-col vt-col--reason" title={item.reason}>
                            {item.reason}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};
