import React, { useEffect } from 'react';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
      >
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </span>
            <div>
              <h2 id="about-modal-title">About This Application</h2>
              <p className="muted">HR Bulk Employee Upload &amp; Error Report Console</p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close about dialog"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="about-dev-card">
            <div>
              <div className="about-label">Developed By</div>
              <div className="about-name">Aakash Deep</div>
              <div className="muted">Built for eGov Foundation Engineering Assessment</div>
            </div>
            <a
              href="https://github.com/eraakashdeep"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--primary btn--sm"
            >
              GitHub · @eraakashdeep
            </a>
          </div>

          <div className="about-grid">
            <div className="about-item">
              <h3>Spreadsheet Row Alignment</h3>
              <p>
                Maps the backend&apos;s 0-based data index to 1-based spreadsheet lines (
                <code>row + 2</code>) so row numbers in the UI and downloaded CSV match Excel/Sheets.
              </p>
            </div>
            <div className="about-item">
              <h3>Resilient Job Polling</h3>
              <p>
                Streams upload bytes via <code>XHR</code>, polls with exponential backoff, survives
                transient HTTP 500s, persists active jobs in <code>localStorage</code>, and cleans up on unmount.
              </p>
            </div>
            <div className="about-item">
              <h3>Re-Upload Diff Engine</h3>
              <p>
                Compares consecutive runs client-side to surface <strong>Fixed</strong>,{' '}
                <strong>Still Failing</strong>, and <strong>New Issues</strong> alongside summary deltas.
              </p>
            </div>
            <div className="about-item">
              <h3>60fps Virtualized Grid</h3>
              <p>
                Renders only visible error rows in a windowed viewport so 2,500–50,000+ errors filter
                and scroll smoothly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
