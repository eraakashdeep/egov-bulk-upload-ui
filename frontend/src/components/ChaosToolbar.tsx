import React, { useEffect, useState } from 'react';
import { getChaosMode, resetMockApi, setChaosMode } from '../api/client';
import type { ChaosMode } from '../types';

interface ChaosToolbarProps {
  onBackendReset: () => void;
}

const CHAOS_OPTIONS: { value: ChaosMode; label: string }[] = [
  { value: 'none', label: 'none (normal)' },
  { value: 'slow-processing', label: 'slow-processing (4x slower)' },
  { value: 'status-500-once', label: 'status-500-once (2nd poll returns 500)' },
  { value: 'job-failed', label: 'job-failed (fails at ~40%)' },
];

export const ChaosToolbar: React.FC<ChaosToolbarProps> = ({ onBackendReset }) => {
  const [mode, setMode] = useState<ChaosMode>('none');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getChaosMode(controller.signal)
      .then((res) => setMode(res.mode))
      .catch(() => {
        // Backend may still be booting
      });
    return () => controller.abort();
  }, []);

  const handleModeChange = async (next: ChaosMode) => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await setChaosMode(next);
      setMode(res.mode);
      setStatusMsg(`Chaos mode set to "${res.mode}" for new uploads.`);
    } catch {
      setStatusMsg('Unable to update chaos mode (check mock API connection).');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      await resetMockApi();
      onBackendReset();
      setStatusMsg('Mock API reset: jobs cleared and 237 seed employees restored.');
    } catch {
      setStatusMsg('Unable to reset mock API.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chaos-bar" aria-label="Mock API Chaos Controls">
      <div className="chaos-controls">
        <label className="inline-label">
          <span>Mock Chaos Mode:</span>
          <select
            aria-label="Mock Chaos Mode"
            value={mode}
            disabled={busy}
            onChange={(e) => void handleModeChange(e.target.value as ChaosMode)}
          >
            {CHAOS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="btn btn--secondary btn--sm"
          disabled={busy}
          onClick={() => void handleReset()}
        >
          Reset Mock Data
        </button>
      </div>
      {statusMsg && <span className="chaos-msg">{statusMsg}</span>}
    </div>
  );
};
