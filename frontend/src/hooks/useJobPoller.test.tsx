import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeNextDelay, useJobPoller } from './useJobPoller';

describe('computeNextDelay', () => {
  it('applies exponential backoff capped at maxDelayMs', () => {
    expect(computeNextDelay(600, 1.5, 3000)).toBe(900);
    expect(computeNextDelay(2500, 1.5, 3000)).toBe(3000);
  });
});

describe('useJobPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls with backoff, survives a 500 response on poll #2 (status-500-once), and completes', async () => {
    const onCompleted = vi.fn();
    let calls = 0;

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            id: 'job-1',
            filename: 'upload-1.csv',
            status: 'queued',
            totalRows: 100,
            processed: 0,
            createdAt: '2026-11-26T10:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (calls === 2) {
        return new Response(
          JSON.stringify({ error: 'internal_error', message: 'Simulated one-off failure' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (calls === 3) {
        return new Response(
          JSON.stringify({
            id: 'job-1',
            filename: 'upload-1.csv',
            status: 'processing',
            totalRows: 100,
            processed: 60,
            createdAt: '2026-11-26T10:00:00Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          id: 'job-1',
          filename: 'upload-1.csv',
          status: 'completed',
          totalRows: 100,
          processed: 100,
          createdAt: '2026-11-26T10:00:00Z',
          summary: { loaded: 95, rejected: 4, duplicate: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const { result } = renderHook(() =>
      useJobPoller('job-1', {
        initialDelayMs: 500,
        maxDelayMs: 2000,
        backoffFactor: 1.5,
        onCompleted,
      })
    );

    // Poll #1 fires immediately
    await act(async () => {
      await Promise.resolve();
    });
    expect(calls).toBe(1);
    expect(result.current.job?.status).toBe('queued');

    // Poll #2 after backoff (750ms) -> 500 error, should stay polling with warning
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    expect(calls).toBe(2);
    expect(result.current.isPolling).toBe(true);
    expect(result.current.transientWarning).toMatch(/500/);

    // Poll #3 after retry backoff (1125ms) -> processing, clears warning
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1125);
    });
    expect(calls).toBe(3);
    expect(result.current.transientWarning).toBeNull();
    expect(result.current.job?.processed).toBe(60);

    // Poll #4 after backoff (1688ms) -> completed
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1688);
    });
    expect(calls).toBe(4);
    expect(result.current.isPolling).toBe(false);
    expect(result.current.job?.status).toBe('completed');
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('clears pending timers and stops polling when unmounted', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          id: 'job-2',
          filename: 'upload-1.csv',
          status: 'processing',
          totalRows: 500,
          processed: 100,
          createdAt: '2026-11-26T10:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const { unmount } = renderHook(() =>
      useJobPoller('job-2', { initialDelayMs: 500 })
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    // No further polling requests after unmount
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces terminal job-failed state and stops polling', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'job-fail',
          filename: 'upload-1.csv',
          status: 'failed',
          totalRows: 1000,
          processed: 400,
          createdAt: '2026-11-26T10:00:00Z',
          error: {
            code: 'PROCESSING_ERROR',
            message: 'Processing stopped unexpectedly.',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const { result } = renderHook(() => useJobPoller('job-fail'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isPolling).toBe(false);
    expect(result.current.terminalError).toBe('Processing stopped unexpectedly.');
  });
});
