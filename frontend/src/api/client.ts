import type {
  ChaosMode,
  EmployeesResponse,
  ErrorsResponse,
  JobView,
} from '../types';

export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || '/api';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function uploadCsv(
  file: File,
  onProgress: (percent: number) => void,
  signal?: AbortSignal
): Promise<JobView> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/uploads`);

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException('Upload aborted', 'AbortError'));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(pct);
      }
    };

    xhr.onload = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(xhr.responseText || '{}') as Record<string, unknown>;
      } catch {
        body = {};
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve(body as unknown as JobView);
      } else {
        const code = String(body.error || `http_${xhr.status}`);
        const missing = Array.isArray(body.missing) ? body.missing.join(', ') : '';
        const msg =
          (typeof body.message === 'string' && body.message) ||
          (missing ? `Missing required columns: ${missing}` : `Upload failed (${code})`);
        reject(new ApiError(xhr.status, code, msg, body));
      }
    };

    xhr.onerror = () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(new ApiError(0, 'network_error', 'Network error while uploading file.'));
    };

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

export async function getJobStatus(jobId: string, signal?: AbortSignal): Promise<JobView> {
  const res = await fetch(`${API_BASE}/uploads/${encodeURIComponent(jobId)}`, {
    signal,
    cache: 'no-store',
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      String(body.error || `http_${res.status}`),
      String(body.message || `Status request failed with HTTP ${res.status}`),
      body
    );
  }
  return body as unknown as JobView;
}

export async function getJobErrors(jobId: string, signal?: AbortSignal): Promise<ErrorsResponse> {
  const res = await fetch(`${API_BASE}/uploads/${encodeURIComponent(jobId)}/errors`, {
    signal,
    cache: 'no-store',
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      String(body.error || `http_${res.status}`),
      String(body.message || `Failed to load errors (HTTP ${res.status})`),
      body
    );
  }
  return body as unknown as ErrorsResponse;
}

export async function getEmployees(
  page: number,
  pageSize: number,
  signal?: AbortSignal
): Promise<EmployeesResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const res = await fetch(`${API_BASE}/employees?${params.toString()}`, {
    signal,
    cache: 'no-store',
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      String(body.error || `http_${res.status}`),
      String(body.message || `Failed to load employees (HTTP ${res.status})`),
      body
    );
  }
  return body as unknown as EmployeesResponse;
}

export async function getChaosMode(signal?: AbortSignal): Promise<{ mode: ChaosMode; modes: ChaosMode[] }> {
  const res = await fetch(`${API_BASE}/admin/chaos`, { signal, cache: 'no-store' });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new ApiError(res.status, 'chaos_fetch_failed', 'Failed to inspect chaos mode');
  }
  return body as unknown as { mode: ChaosMode; modes: ChaosMode[] };
}

export async function setChaosMode(mode: ChaosMode): Promise<{ mode: ChaosMode }> {
  const res = await fetch(`${API_BASE}/admin/chaos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  const body = await parseJsonSafe(res);
  if (!res.ok) {
    throw new ApiError(res.status, 'chaos_update_failed', 'Failed to switch chaos mode');
  }
  return body as unknown as { mode: ChaosMode };
}

export async function resetMockApi(): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/reset`, { method: 'POST' });
  if (!res.ok) {
    throw new ApiError(res.status, 'reset_failed', 'Failed to reset mock API state');
  }
}
