export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export const REQUIRED_COLUMNS = [
  'employee_id',
  'first_name',
  'last_name',
  'email',
  'department',
  'date_of_joining',
] as const;

export interface PreflightResult {
  valid: boolean;
  error?: string;
  missingColumns?: string[];
  headers?: string[];
}

export function parseCsvHeaderLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function validateCsvText(filename: string, sizeBytes: number, headText: string): PreflightResult {
  if (!/\.csv$/i.test(filename.trim())) {
    return { valid: false, error: 'Only .csv files are accepted.' };
  }

  if (sizeBytes <= 0) {
    return { valid: false, error: 'The selected file is empty (0 bytes).' };
  }

  if (sizeBytes > MAX_FILE_BYTES) {
    const mb = (sizeBytes / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${mb} MB) exceeds the 10 MB upload limit.`,
    };
  }

  const normalized = headText.charCodeAt(0) === 0xfeff ? headText.slice(1) : headText;
  const lineBreakIdx = normalized.search(/\r?\n/);

  if (lineBreakIdx === -1) {
    // Either single line header with no data rows, or huge header > slice
    const headers = parseCsvHeaderLine(normalized);
    const missingColumns = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));
    if (missingColumns.length > 0) {
      return {
        valid: false,
        error: `Missing required header column(s): ${missingColumns.join(', ')}`,
        missingColumns,
        headers,
      };
    }
    return {
      valid: false,
      error: 'CSV contains a header row but no employee data rows.',
      headers,
    };
  }

  const headerLine = normalized.slice(0, lineBreakIdx);
  const remainder = normalized.slice(lineBreakIdx).trim();

  if (!headerLine.trim()) {
    return { valid: false, error: 'CSV header row is empty.' };
  }

  const headers = parseCsvHeaderLine(headerLine);
  const missingColumns = REQUIRED_COLUMNS.filter((col) => !headers.includes(col));

  if (missingColumns.length > 0) {
    return {
      valid: false,
      error: `Missing required header column(s): ${missingColumns.join(', ')}`,
      missingColumns,
      headers,
    };
  }

  if (!remainder) {
    return {
      valid: false,
      error: 'CSV contains a header row but no employee data rows.',
      headers,
    };
  }

  return { valid: true, headers };
}

function readBlobAsText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsText(blob);
  });
}

export async function validateCsvFile(file: File): Promise<PreflightResult> {
  if (!/\.csv$/i.test(file.name.trim())) {
    return { valid: false, error: 'Only .csv files are accepted.' };
  }
  if (file.size <= 0) {
    return { valid: false, error: 'The selected file is empty (0 bytes).' };
  }
  if (file.size > MAX_FILE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${mb} MB) exceeds the 10 MB upload limit.`,
    };
  }

  const headSlice = typeof file.slice === 'function' ? file.slice(0, 128 * 1024) : file;
  const headText = await readBlobAsText(headSlice);
  return validateCsvText(file.name, file.size, headText);
}
