import type { RunDiff, RunSnapshot, StillFailingItem, UploadErrorItem } from '../types';

/**
 * Compares two completed upload runs by row index.
 * Admins typically fix errors in place (e.g. upload-1.csv -> upload-2-corrected.csv),
 * so matching by `row` accurately tracks fixed, persistent, and newly introduced errors.
 */
export function compareRuns(previous: RunSnapshot, current: RunSnapshot): RunDiff {
  const prevByRow = new Map<number, UploadErrorItem>();
  for (const err of previous.errors) {
    prevByRow.set(err.row, err);
  }

  const currByRow = new Map<number, UploadErrorItem>();
  for (const err of current.errors) {
    currByRow.set(err.row, err);
  }

  const fixed: UploadErrorItem[] = [];
  const removedOutOfRange: UploadErrorItem[] = [];
  const stillFailing: StillFailingItem[] = [];
  const newlyIntroduced: UploadErrorItem[] = [];

  for (const prevErr of previous.errors) {
    if (!currByRow.has(prevErr.row)) {
      if (prevErr.row < current.totalRows) {
        fixed.push(prevErr);
      } else {
        removedOutOfRange.push(prevErr);
      }
    }
  }

  for (const currErr of current.errors) {
    const prevErr = prevByRow.get(currErr.row);
    if (prevErr) {
      stillFailing.push({
        previous: prevErr,
        current: currErr,
        changedReason:
          prevErr.code !== currErr.code ||
          prevErr.type !== currErr.type ||
          prevErr.field !== currErr.field ||
          prevErr.employee_id !== currErr.employee_id,
      });
    } else {
      newlyIntroduced.push(currErr);
    }
  }

  return {
    previousJobId: previous.jobId,
    previousFilename: previous.filename,
    currentJobId: current.jobId,
    currentFilename: current.filename,
    summaryDelta: {
      totalRows: current.totalRows - previous.totalRows,
      loaded: current.summary.loaded - previous.summary.loaded,
      rejected: current.summary.rejected - previous.summary.rejected,
      duplicate: current.summary.duplicate - previous.summary.duplicate,
    },
    fixed,
    removedOutOfRange,
    stillFailing,
    newlyIntroduced,
    comparisonReliable: !previous.errorsTruncated && !current.errorsTruncated,
  };
}
