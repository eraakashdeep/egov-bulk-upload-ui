import React, { useState } from 'react';
import type { JobSummary, RunDiff } from '../types';
import { toSpreadsheetRow } from '../utils/rowMapping';

interface RunSummaryAndDiffProps {
  filename: string;
  totalRows: number;
  summary: JobSummary;
  diff: RunDiff | null;
}

function formatDelta(delta: number): string {
  if (delta === 0) return '0';
  return delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString();
}

export const RunSummaryAndDiff: React.FC<RunSummaryAndDiffProps> = ({
  filename,
  totalRows,
  summary,
  diff,
}) => {
  const [diffTab, setDiffTab] = useState<'fixed' | 'still' | 'new'>('fixed');

  return (
    <section className="card" aria-labelledby="summary-heading">
      <div className="card-header">
        <div>
          <h2 id="summary-heading">Result Summary</h2>
          <p className="muted">
            Processed <strong>{totalRows.toLocaleString()}</strong> data rows from{' '}
            <strong>{filename}</strong>
          </p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-box stat-box--success">
          <span className="stat-label">Loaded</span>
          <strong className="stat-value">{summary.loaded.toLocaleString()}</strong>
          {diff && (
            <span className="stat-delta">
              vs prev: {formatDelta(diff.summaryDelta.loaded)}
            </span>
          )}
        </div>
        <div className="stat-box stat-box--danger">
          <span className="stat-label">Rejected</span>
          <strong className="stat-value">{summary.rejected.toLocaleString()}</strong>
          {diff && (
            <span className="stat-delta">
              vs prev: {formatDelta(diff.summaryDelta.rejected)}
            </span>
          )}
        </div>
        <div className="stat-box stat-box--warning">
          <span className="stat-label">Duplicate</span>
          <strong className="stat-value">{summary.duplicate.toLocaleString()}</strong>
          {diff && (
            <span className="stat-delta">
              vs prev: {formatDelta(diff.summaryDelta.duplicate)}
            </span>
          )}
        </div>
        <div className="stat-box">
          <span className="stat-label">Total Errors</span>
          <strong className="stat-value">
            {(summary.rejected + summary.duplicate).toLocaleString()}
          </strong>
          {diff && (
            <span className="stat-delta">
              vs prev:{' '}
              {formatDelta(diff.summaryDelta.rejected + diff.summaryDelta.duplicate)}
            </span>
          )}
        </div>
      </div>

      {diff && (
        <div className="diff-panel" aria-labelledby="diff-heading">
          <div className="diff-header">
            <h3 id="diff-heading">Changes vs. Previous Run</h3>
            <span className="muted">
              {diff.previousFilename} ({diff.previousJobId}) → {diff.currentFilename} (
              {diff.currentJobId})
            </span>
          </div>

          {!diff.comparisonReliable ? (
            <p className="alert alert--warning">
              Row-level error snapshot from the previous run was too large for browser
              storage after refresh; summary deltas are still shown above.
            </p>
          ) : (
            <>
              <div className="diff-tabs" role="tablist" aria-label="Run comparison details">
                <button
                  type="button"
                  role="tab"
                  aria-selected={diffTab === 'fixed'}
                  className={`tab-pill ${diffTab === 'fixed' ? 'tab-pill--active' : ''}`}
                  onClick={() => setDiffTab('fixed')}
                >
                  Fixed ({diff.fixed.length.toLocaleString()})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={diffTab === 'still'}
                  className={`tab-pill ${diffTab === 'still' ? 'tab-pill--active' : ''}`}
                  onClick={() => setDiffTab('still')}
                >
                  Still Failing ({diff.stillFailing.length.toLocaleString()})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={diffTab === 'new'}
                  className={`tab-pill ${diffTab === 'new' ? 'tab-pill--active' : ''}`}
                  onClick={() => setDiffTab('new')}
                >
                  New Issues ({diff.newlyIntroduced.length.toLocaleString()})
                </button>
              </div>

              <div className="diff-list-wrapper">
                {diffTab === 'fixed' && (
                  <DiffSimpleList
                    emptyText="No previously failing rows were fixed in this upload."
                    items={diff.fixed.slice(0, 100)}
                    totalCount={diff.fixed.length}
                    badge="Fixed"
                    badgeTone="success"
                  />
                )}
                {diffTab === 'still' && (
                  <div className="diff-table-scroll">
                    {diff.stillFailing.length === 0 ? (
                      <p className="muted">No persistent errors remain.</p>
                    ) : (
                      <>
                        <table className="compact-table">
                          <thead>
                            <tr>
                              <th>Spreadsheet Row</th>
                              <th>Employee ID</th>
                              <th>Previous Error</th>
                              <th>Current Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {diff.stillFailing.slice(0, 100).map((item) => (
                              <tr key={`${item.current.row}-${item.current.code}`}>
                                <td>#{toSpreadsheetRow(item.current.row)}</td>
                                <td>{item.current.employee_id || '—'}</td>
                                <td>{item.previous.reason}</td>
                                <td>
                                  {item.current.reason}
                                  {item.changedReason && (
                                    <span className="tag tag--info">Changed</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {diff.stillFailing.length > 100 && (
                          <p className="muted small-note">
                            Showing first 100 of {diff.stillFailing.length.toLocaleString()}{' '}
                            persistent errors. See the full Error Table below.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
                {diffTab === 'new' && (
                  <DiffSimpleList
                    emptyText="No new errors were introduced in this upload."
                    items={diff.newlyIntroduced.slice(0, 100)}
                    totalCount={diff.newlyIntroduced.length}
                    badge="New"
                    badgeTone="danger"
                  />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};

interface DiffSimpleListProps {
  items: { row: number; employee_id: string; field: string; code: string; reason: string }[];
  totalCount: number;
  emptyText: string;
  badge: string;
  badgeTone: 'success' | 'danger';
}

const DiffSimpleList: React.FC<DiffSimpleListProps> = ({
  items,
  totalCount,
  emptyText,
  badge,
  badgeTone,
}) => {
  if (totalCount === 0) return <p className="muted">{emptyText}</p>;
  return (
    <div className="diff-table-scroll">
      <table className="compact-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Spreadsheet Row</th>
            <th>Employee ID</th>
            <th>Field</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.row}-${item.code}`}>
              <td>
                <span className={`badge badge--${badgeTone}`}>{badge}</span>
              </td>
              <td>#{toSpreadsheetRow(item.row)}</td>
              <td>{item.employee_id || '—'}</td>
              <td>{item.field}</td>
              <td>{item.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalCount > items.length && (
        <p className="muted small-note">
          Showing first {items.length} of {totalCount.toLocaleString()} rows.
        </p>
      )}
    </div>
  );
};
