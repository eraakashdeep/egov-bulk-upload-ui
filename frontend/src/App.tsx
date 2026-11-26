import React, { useCallback, useState } from 'react';
import { AboutModal } from './components/AboutModal';
import { ChaosToolbar } from './components/ChaosToolbar';
import { EmployeeDirectory } from './components/EmployeeDirectory';
import { UploadPage } from './components/UploadPage';
import type { RunDiff, RunSnapshot } from './types';
import {
  clearActiveJob,
  clearLastRun,
  loadActiveJob,
  loadLastRun,
} from './utils/storage';

type ActiveTab = 'upload' | 'employees';

export const App: React.FC = () => {
  const initialActive = loadActiveJob();
  const initialLastRun = loadLastRun();

  const [tab, setTab] = useState<ActiveTab>('upload');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(
    initialActive?.jobId ?? null
  );
  const [activeFilename, setActiveFilename] = useState<string | undefined>(
    initialActive?.filename
  );
  const [previousRun, setPreviousRun] = useState<RunSnapshot | null>(initialLastRun);
  const [currentRun, setCurrentRun] = useState<RunSnapshot | null>(
    initialActive ? null : initialLastRun
  );
  const [currentDiff, setCurrentDiff] = useState<RunDiff | null>(null);
  const [employeeRefreshSignal, setEmployeeRefreshSignal] = useState(0);

  const handleJobStarted = useCallback((jobId: string, filename: string) => {
    setActiveJobId(jobId);
    setActiveFilename(filename);
    setCurrentDiff(null);
  }, []);

  const handleJobCleared = useCallback(() => {
    setActiveJobId(null);
    setActiveFilename(undefined);
  }, []);

  const handleRunCompleted = useCallback(
    (snapshot: RunSnapshot, diff: RunDiff | null) => {
      setPreviousRun(snapshot);
      setCurrentRun(snapshot);
      setCurrentDiff(diff);
      setActiveJobId(null);
      setActiveFilename(undefined);
      setEmployeeRefreshSignal((n) => n + 1);
    },
    []
  );

  const handleBackendReset = useCallback(() => {
    clearActiveJob();
    clearLastRun();
    setActiveJobId(null);
    setActiveFilename(undefined);
    setPreviousRun(null);
    setCurrentRun(null);
    setCurrentDiff(null);
    setEmployeeRefreshSignal((n) => n + 1);
  }, []);

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="container top-header-inner">
          <div className="brand-block">
            <div className="brand-mark" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M12 18v-6" />
                <path d="m9 15 3-3 3 3" />
              </svg>
            </div>
            <div>
              <div className="brand-title-row">
                <h1>HR Bulk Employee Upload</h1>
                <span className="org-pill">eGov Portal</span>
              </div>
              <p className="muted">
                Asynchronous CSV ingestion, spreadsheet-aligned error reporting &amp;
                directory
              </p>
            </div>
          </div>

          <div className="header-actions">
            <nav className="nav-tabs" aria-label="Primary navigation">
              <button
                type="button"
                className={`nav-tab ${tab === 'upload' ? 'nav-tab--active' : ''}`}
                onClick={() => setTab('upload')}
              >
                Bulk Upload &amp; Errors
              </button>
              <button
                type="button"
                className={`nav-tab ${tab === 'employees' ? 'nav-tab--active' : ''}`}
                onClick={() => setTab('employees')}
              >
                Employee Directory
              </button>
            </nav>

            <button
              type="button"
              className="about-trigger"
              aria-label="About application and developer"
              title="About developer & architecture"
              onClick={() => setAboutOpen(true)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              <span>About</span>
            </button>
          </div>
        </div>
      </header>

      <main className="container main-content">
        <ChaosToolbar onBackendReset={handleBackendReset} />

        {tab === 'upload' ? (
          <UploadPage
            activeJobId={activeJobId}
            activeFilename={activeFilename}
            previousRun={previousRun}
            currentRun={currentRun}
            currentDiff={currentDiff}
            onJobStarted={handleJobStarted}
            onJobCleared={handleJobCleared}
            onRunCompleted={handleRunCompleted}
          />
        ) : (
          <EmployeeDirectory refreshSignal={employeeRefreshSignal} />
        )}
      </main>

      <footer className="app-footer">
        <div className="container footer-inner">
          <div className="footer-copy">
            <span>© 2026 eGov Foundation · Developed by </span>
            <strong>Aakash Deep</strong>
          </div>
        </div>
      </footer>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
};

export default App;
