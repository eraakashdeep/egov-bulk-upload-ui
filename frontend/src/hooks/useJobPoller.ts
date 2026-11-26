import { useEffect, useRef, useState } from 'react';
import { ApiError, getJobStatus } from '../api/client';
import type { JobView } from '../types';

export interface PollingOptions {
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  maxTransientRetries?: number;
  onCompleted?: (job: JobView) => void;
  onNotFound?: (jobId: string) => void;
}

export interface PollingState {
  job: JobView | null;
  isPolling: boolean;
  transientWarning: string | null;
  retryCount: number;
  terminalError: string | null;
  lastDelayMs: number;
}

export function computeNextDelay(
  currentDelayMs: number,
  backoffFactor: number,
  maxDelayMs: number
): number {
  return Math.min(maxDelayMs, Math.round(currentDelayMs * backoffFactor));
}

export function useJobPoller(jobId: string | null, options: PollingOptions = {}): PollingState {
  const {
    initialDelayMs = 600,
    maxDelayMs = 3000,
    backoffFactor = 1.35,
    maxTransientRetries = 5,
    onCompleted,
    onNotFound,
  } = options;

  const [state, setState] = useState<PollingState>({
    job: null,
    isPolling: Boolean(jobId),
    transientWarning: null,
    retryCount: 0,
    terminalError: null,
    lastDelayMs: initialDelayMs,
  });

  const onCompletedRef = useRef(onCompleted);
  const onNotFoundRef = useRef(onNotFound);
  onCompletedRef.current = onCompleted;
  onNotFoundRef.current = onNotFound;

  useEffect(() => {
    if (!jobId) {
      setState({
        job: null,
        isPolling: false,
        transientWarning: null,
        retryCount: 0,
        terminalError: null,
        lastDelayMs: initialDelayMs,
      });
      return;
    }

    let cancelled = false;
    let timerId: number | undefined;
    let activeController: AbortController | null = null;
    let delayMs = initialDelayMs;
    let consecutiveErrors = 0;

    setState((prev) => ({
      ...prev,
      job: prev.job?.id === jobId ? prev.job : null,
      isPolling: true,
      transientWarning: null,
      retryCount: 0,
      terminalError: null,
      lastDelayMs: initialDelayMs,
    }));

    const scheduleNext = (waitMs: number) => {
      if (cancelled) return;
      timerId = window.setTimeout(pollOnce, waitMs);
    };

    const pollOnce = async () => {
      if (cancelled) return;
      activeController = new AbortController();

      try {
        const snapshot = await getJobStatus(jobId, activeController.signal);
        if (cancelled) return;

        consecutiveErrors = 0;

        if (snapshot.status === 'completed') {
          setState({
            job: snapshot,
            isPolling: false,
            transientWarning: null,
            retryCount: 0,
            terminalError: null,
            lastDelayMs: delayMs,
          });
          onCompletedRef.current?.(snapshot);
          return;
        }

        if (snapshot.status === 'failed') {
          setState({
            job: snapshot,
            isPolling: false,
            transientWarning: null,
            retryCount: 0,
            terminalError:
              snapshot.error?.message || 'Processing failed on the server.',
            lastDelayMs: delayMs,
          });
          return;
        }

        const nextDelay = computeNextDelay(delayMs, backoffFactor, maxDelayMs);
        setState({
          job: snapshot,
          isPolling: true,
          transientWarning: null,
          retryCount: 0,
          terminalError: null,
          lastDelayMs: nextDelay,
        });
        delayMs = nextDelay;
        scheduleNext(delayMs);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;

        const isNotFound = err instanceof ApiError && err.status === 404;
        if (isNotFound) {
          setState((prev) => ({
            ...prev,
            isPolling: false,
            transientWarning: null,
            terminalError:
              'This upload job is no longer available on the server (the backend may have restarted).',
          }));
          onNotFoundRef.current?.(jobId);
          return;
        }

        const isRetryable =
          !(err instanceof ApiError) || err.status === 0 || err.status >= 500;

        consecutiveErrors += 1;

        if (isRetryable && consecutiveErrors <= maxTransientRetries) {
          const retryDelay = computeNextDelay(delayMs, 1.5, Math.max(maxDelayMs, 4000));
          delayMs = retryDelay;
          setState((prev) => ({
            ...prev,
            isPolling: true,
            retryCount: consecutiveErrors,
            transientWarning: `Temporary server error (${
              err instanceof ApiError && err.status ? `HTTP ${err.status}` : 'network'
            }). Retrying automatically (${consecutiveErrors}/${maxTransientRetries})...`,
            lastDelayMs: retryDelay,
          }));
          scheduleNext(retryDelay);
          return;
        }

        setState((prev) => ({
          ...prev,
          isPolling: false,
          transientWarning: null,
          retryCount: consecutiveErrors,
          terminalError:
            err instanceof Error ? err.message : 'Unable to reach status endpoint.',
        }));
      }
    };

    pollOnce();

    return () => {
      cancelled = true;
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
      if (activeController) {
        activeController.abort();
      }
    };
  }, [jobId, initialDelayMs, maxDelayMs, backoffFactor, maxTransientRetries]);

  return state;
}
