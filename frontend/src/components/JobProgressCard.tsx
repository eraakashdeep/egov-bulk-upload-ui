import React from 'react';
import type { JobView } from '../types';

interface JobProgressCardProps {
  job: JobView | null;
  activeJobId: string | null;
  activeFilename?: string;
  isPolling: boolean;
  transientWarning: string | null;
  terminalError: string | null;
  onDismissJob: () => void;
}

export const JobProgressCard: React.FC<JobProgressCardProps> = ({
  job,
  activeJobId,
  activeFilename,
  isPolling,
  transientWarning,
  terminalError,
  onDismissJob,
}) => {
  if (!activeJobId && !job && !terminalError) return null;

  const status = job?.status ?? (terminalError ? 'failed' : 'queued');
  const total = job?.totalRows ?? 0;
  const processed = job?.processed ?? 0;
  const pct =
    status === 'completed'
      ? 100
      : total > 0
      ? Math.min(99, Math.round((processed / total) * 100))
      : 0;

  return (
    <section className="card" aria-labelledby="job-status-heading">
      <div className="card-header">
        <div>
          <h2 id="job-status-heading">
            Job Status{' '}
            <span className={`badge badge--${status}`}>{status.toUpperCase()}</span>
          </h2>
          <p className="muted">
            Job ID: <code>{job?.id || activeJobId}</code> · File:{' '}
            <strong>{job?.filename || activeFilename || 'upload.csv'}</strong>
          </p>
        </div>
        {!isPolling && (
          <button type="button" className="btn btn--secondary btn--sm" onClick={onDismissJob}>
            Clear
          </button>
        )}
      </div>

      <div className="progress-label-row">
        <span>
          {status === 'queued' && 'Queued on server, waiting for worker...'}
          {status === 'processing' &&
            `Processing rows: ${processed.toLocaleString()} / ${total.toLocaleString()}`}
          {status === 'completed' &&
            `Completed: ${total.toLocaleString()} rows processed`}
          {status === 'failed' &&
            `Stopped at ${processed.toLocaleString()} / ${total.toLocaleString()} rows`}
        </span>
        <strong>{pct}%</strong>
      </div>

      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`progress-fill ${
            status === 'failed'
              ? 'progress-fill--error'
              : status === 'completed'
              ? 'progress-fill--success'
              : ''
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {isPolling && (
        <p className="muted small-note">
          Live polling active (with backoff). Refreshing the page preserves your job ID and resumes tracking.
        </p>
      )}

      {transientWarning && (
        <div className="alert alert--warning" role="status">
          {transientWarning}
        </div>
      )}

      {terminalError && (
        <div className="alert alert--error" role="alert">
          <strong>Job Error:</strong> {terminalError}
        </div>
      )}
    </section>
  );
};
