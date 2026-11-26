import type { UploadErrorItem } from '../types';

/**
 * The backend reports `row` as a 0-based index into data rows (excluding the header).
 * In spreadsheet tools (Excel, Google Sheets, LibreOffice), row 1 is the header line,
 * so data index 0 corresponds to spreadsheet row 2.
 */
export const HEADER_ROW_OFFSET = 2;

export function toSpreadsheetRow(serverRowIndex: number): number {
  return serverRowIndex + HEADER_ROW_OFFSET;
}

export function toDataRowNumber(serverRowIndex: number): number {
  return serverRowIndex + 1;
}

export function escapeCsvCell(value: unknown): string {
  const str = String(value === undefined || value === null ? '' : value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const REPORT_COLUMNS = ['row', 'employee_id', 'type', 'field', 'code', 'reason'] as const;

export function buildErrorReportCsv(items: UploadErrorItem[]): string {
  const header = REPORT_COLUMNS.join(',');
  const lines = items.map((item) => {
    const mapped: Record<(typeof REPORT_COLUMNS)[number], string | number> = {
      row: toSpreadsheetRow(item.row),
      employee_id: item.employee_id,
      type: item.type,
      field: item.field,
      code: item.code,
      reason: item.reason,
    };
    return REPORT_COLUMNS.map((col) => escapeCsvCell(mapped[col])).join(',');
  });
  return [header, ...lines].join('\r\n') + '\r\n';
}

export function downloadCsvContent(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
