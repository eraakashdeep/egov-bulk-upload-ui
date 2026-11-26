import { describe, expect, it } from 'vitest';
import type { RunSnapshot } from '../types';
import { compareRuns } from './runDiff';

describe('compareRuns', () => {
  it('identifies fixed, still-failing (including changed reason), and newly introduced errors', () => {
    const prev: RunSnapshot = {
      jobId: 'job-1',
      filename: 'upload-1.csv',
      completedAt: '2026-11-26T10:00:00Z',
      totalRows: 100,
      summary: { loaded: 97, rejected: 2, duplicate: 1 },
      errors: [
        {
          row: 1,
          employee_id: 'EMP-00002',
          type: 'rejected',
          field: 'email',
          code: 'INVALID_EMAIL',
          reason: 'email is not a valid address',
        },
        {
          row: 5,
          employee_id: 'EMP-00006',
          type: 'rejected',
          field: 'phone',
          code: 'INVALID_PHONE',
          reason: 'phone must be 10 digits',
        },
        {
          row: 9,
          employee_id: 'EMP-00002',
          type: 'duplicate',
          field: 'employee_id',
          code: 'DUPLICATE_ID',
          reason: 'employee_id appears earlier in this file',
        },
      ],
    };

    const curr: RunSnapshot = {
      jobId: 'job-2',
      filename: 'upload-2-corrected.csv',
      completedAt: '2026-11-26T10:05:00Z',
      totalRows: 100,
      summary: { loaded: 98, rejected: 2, duplicate: 0 },
      errors: [
        {
          row: 5,
          employee_id: 'EMP-00006',
          type: 'rejected',
          field: 'date_of_joining',
          code: 'DATE_IN_FUTURE',
          reason: 'date_of_joining cannot be in the future',
        },
        {
          row: 20,
          employee_id: 'EMP-00021',
          type: 'rejected',
          field: 'department',
          code: 'REQUIRED',
          reason: 'department is required',
        },
      ],
    };

    const diff = compareRuns(prev, curr);

    expect(diff.summaryDelta).toEqual({
      totalRows: 0,
      loaded: 1,
      rejected: 0,
      duplicate: -1,
    });
    expect(diff.fixed.map((e) => e.row)).toEqual([1, 9]);
    expect(diff.stillFailing).toHaveLength(1);
    expect(diff.stillFailing[0].current.row).toBe(5);
    expect(diff.stillFailing[0].changedReason).toBe(true);
    expect(diff.newlyIntroduced.map((e) => e.row)).toEqual([20]);
    expect(diff.comparisonReliable).toBe(true);
  });
});
