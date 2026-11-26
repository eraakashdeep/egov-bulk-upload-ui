import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getJobErrors, uploadCsv } from '../api/client';
import { useJobPoller } from '../hooks/useJobPoller';
import type { JobView, RunDiff, RunSnapshot, UploadErrorItem } from '../types';
import { compareRuns } from '../utils/runDiff';
import { clearActiveJob, saveActiveJob, saveLastRun } from '../utils/storage';
import { JobProgressCard } from './JobProgressCard';
import { RunSummaryAndDiff } from './RunSummaryAndDiff';
import { UploadDropzone } from './UploadDropzone';
import { VirtualErrorTable } from './VirtualErrorTable';

interface UploadPageProps {
  activeJobId: string | null;
  activeFilename?: string;
  previousRun: RunSnapshot | null;
  currentRun: RunSnapshot | null;
  currentDiff: RunDiff | null;
  onJobStarted: (jobId: string, filename: string) => void;
  onJobCleared: () => void;
  onRunCompleted: (snapshot: RunSnapshot, diff: RunDiff | null) => void;
}

export const UploadPage: React.FC<UploadPageProps> = ({
  activeJobId,
  activeFilename,
  previousRun,
  currentRun,
  currentDiff,
  onJobStarted,
  onJobCleared,
  onRunCompleted,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [errors, setErrors] = useState<UploadErrorItem[]>(currentRun?.errors ?? []);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [errorsLoadError, setErrorsLoadError] = useState<string | null>(null);

  const uploadAbortRef = useRef<AbortController | null>(null);
  const errorsAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (currentRun) {
      setErrors(currentRun.errors);
    } else {
      setErrors([]);
    }
  }, [currentRun]);

  // Clean up any in-flight upload/error-fetch on unmount
  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
      errorsAbortRef.current?.abort();
    };
  }, []);

  const handleCompleted = useCallback(
    async (completedJob: JobView) => {
      clearActiveJob();

      if (!completedJob.summary) return;
      errorsAbortRef.current?.abort();
      const controller = new AbortController();
      errorsAbortRef.current = controller;

      setErrorsLoading(true);
      setErrorsLoadError(null);
      try {
        const res = await getJobErrors(completedJob.id, controller.signal);
        const snapshot: RunSnapshot = {
          jobId: completedJob.id,
          filename: completedJob.filename,
          completedAt: new Date().toISOString(),
          totalRows: completedJob.totalRows,
          summary: completedJob.summary,
          errors: res.items,
        };

        const baseline =
          previousRun && previousRun.jobId !== snapshot.jobId
            ? previousRun
            : currentRun && currentRun.jobId !== snapshot.jobId
            ? currentRun
            : null;

        const diff = baseline ? compareRuns(baseline, snapshot) : null;
        setErrors(res.items);
        saveLastRun(snapshot);
        onRunCompleted(snapshot, diff);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setErrorsLoadError(
          err instanceof Error ? err.message : 'Failed to load job errors.'
        );
      } finally {
        setErrorsLoading(false);
      }
    },
    [previousRun, currentRun, onRunCompleted]
  );

  const handleNotFound = useCallback(() => {
    clearActiveJob();
  }, []);

  const poller = useJobPoller(activeJobId, {
    onCompleted: handleCompleted,
    onNotFound: handleNotFound,
  });

  const handleFileAccepted = async (file: File) => {
    setUploadError(null);
    setIsUploading(true);
    setUploadPercent(0);
    setErrorsLoadError(null);

    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;

    try {
      const job = await uploadCsv(
        file,
        (pct) => setUploadPercent(pct),
        controller.signal
      );
      const jobId = job.id || job.jobId || '';
      saveActiveJob({
        jobId,
        filename: job.filename || file.name,
        savedAt: new Date().toISOString(),
      });
      onJobStarted(jobId, job.filename || file.name);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof ApiError) {
        setUploadError(err.message);
      } else {
        setUploadError(err instanceof Error ? err.message : 'Upload failed.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDismissJob = () => {
    clearActiveJob();
    onJobCleared();
  };

  const completedJob =
    poller.job?.status === 'completed' && poller.job.summary ? poller.job : null;

  const displaySummary = completedJob
    ? {
        jobId: completedJob.id,
        filename: completedJob.filename,
        totalRows: completedJob.totalRows,
        summary: completedJob.summary!,
      }
    : currentRun
    ? {
        jobId: currentRun.jobId,
        filename: currentRun.filename,
        totalRows: currentRun.totalRows,
        summary: currentRun.summary,
      }
    : null;

  return (
    <div className="stack">
      <UploadDropzone
        disabled={poller.isPolling}
        isUploading={isUploading}
        uploadPercent={uploadPercent}
        hasPreviousRun={Boolean(currentRun || previousRun)}
        previousFilename={(currentRun || previousRun)?.filename}
        onFileAccepted={handleFileAccepted}
      />

      {uploadError && (
        <div className="alert alert--error" role="alert">
          <strong>Server rejected upload:</strong> {uploadError}
        </div>
      )}

      <JobProgressCard
        job={poller.job}
        activeJobId={activeJobId}
        activeFilename={activeFilename}
        isPolling={poller.isPolling}
        transientWarning={poller.transientWarning}
        terminalError={poller.terminalError}
        onDismissJob={handleDismissJob}
      />

      {displaySummary && (
        <>
          <RunSummaryAndDiff
            filename={displaySummary.filename}
            totalRows={displaySummary.totalRows}
            summary={displaySummary.summary}
            diff={currentDiff}
          />
          <VirtualErrorTable
            jobId={displaySummary.jobId}
            errors={errors}
            loading={errorsLoading}
            loadError={errorsLoadError}
          />
        </>
      )}
    </div>
  );
};
