import type { RunSnapshot } from '../types';

const ACTIVE_JOB_KEY = 'bulk_upload_active_job_v1';
const LAST_RUN_KEY = 'bulk_upload_last_run_v1';
const MAX_STORED_JSON_CHARS = 2 * 1024 * 1024; // Keep well below 5MB localStorage limit

export interface StoredActiveJob {
  jobId: string;
  filename: string;
  savedAt: string;
}

export function loadActiveJob(): StoredActiveJob | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_JOB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredActiveJob>;
    if (!parsed.jobId) return null;
    return {
      jobId: parsed.jobId,
      filename: parsed.filename || 'upload.csv',
      savedAt: parsed.savedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveActiveJob(job: StoredActiveJob): void {
  try {
    window.localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(job));
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function clearActiveJob(): void {
  try {
    window.localStorage.removeItem(ACTIVE_JOB_KEY);
  } catch {
    // Ignore
  }
}

export function loadLastRun(): RunSnapshot | null {
  try {
    const raw = window.localStorage.getItem(LAST_RUN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RunSnapshot;
  } catch {
    return null;
  }
}

export function saveLastRun(snapshot: RunSnapshot): void {
  try {
    const serialized = JSON.stringify(snapshot);
    if (serialized.length <= MAX_STORED_JSON_CHARS) {
      window.localStorage.setItem(LAST_RUN_KEY, serialized);
    } else {
      // Fallback: persist summary without the giant error payload
      const compact: RunSnapshot = {
        ...snapshot,
        errors: [],
        errorsTruncated: true,
      };
      window.localStorage.setItem(LAST_RUN_KEY, JSON.stringify(compact));
    }
  } catch {
    // Ignore storage quota issues
  }
}

export function clearLastRun(): void {
  try {
    window.localStorage.removeItem(LAST_RUN_KEY);
  } catch {
    // Ignore
  }
}
