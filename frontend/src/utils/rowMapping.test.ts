import { describe, expect, it } from 'vitest';
import type { UploadErrorItem } from '../types';
import {
  buildErrorReportCsv,
  escapeCsvCell,
  toDataRowNumber,
  toSpreadsheetRow,
} from './rowMapping';

describe('rowMapping', () => {
  it('maps 0-based server data row indices to 1-based spreadsheet rows (header at row 1)', () => {
    expect(toSpreadsheetRow(0)).toBe(2);
    expect(toSpreadsheetRow(1)).toBe(3);
    expect(toSpreadsheetRow(49999)).toBe(50001);
    expect(toDataRowNumber(0)).toBe(1);
  });

  it('escapes commas, quotes, and newlines per RFC-4180', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('Officer, Grade II')).toBe('"Officer, Grade II"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('builds CSV error report with spreadsheet row numbers (server row + 2)', () => {
    const items: UploadErrorItem[] = [
      {
        row: 0,
        employee_id: 'EMP-00001',
        type: 'rejected',
        field: 'email',
        code: 'INVALID_EMAIL',
        reason: 'email is not a valid address',
      },
      {
        row: 14,
        employee_id: 'EMP-00003',
        type: 'duplicate',
        field: 'employee_id',
        code: 'DUPLICATE_ID',
        reason: 'employee_id appears earlier, check "file"',
      },
    ];

    const csv = buildErrorReportCsv(items);
    const lines = csv.trimEnd().split('\r\n');

    expect(lines[0]).toBe('row,employee_id,type,field,code,reason');
    expect(lines[1]).toBe(
      '2,EMP-00001,rejected,email,INVALID_EMAIL,email is not a valid address'
    );
    expect(lines[2]).toBe(
      '16,EMP-00003,duplicate,employee_id,DUPLICATE_ID,"employee_id appears earlier, check ""file"""'
    );
  });
});
