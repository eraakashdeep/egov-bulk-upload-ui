import { describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES, validateCsvText } from './csvPreflight';

const VALID_HEADER =
  'employee_id,first_name,last_name,email,department,designation,date_of_joining,phone';
const REQUIRED_ONLY_HEADER =
  'employee_id,first_name,last_name,email,department,date_of_joining';

describe('csvPreflight', () => {
  it('rejects non-csv filenames', () => {
    const res = validateCsvText('employees.xlsx', 1024, `${VALID_HEADER}\nEMP-1,A,B,a@b.c,HR,Clerk,2020-01-01,9999999999`);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/\.csv/i);
  });

  it('rejects empty 0-byte files', () => {
    const res = validateCsvText('employees.csv', 0, '');
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/empty/i);
  });

  it('rejects files larger than 10 MB', () => {
    const res = validateCsvText('big.csv', MAX_FILE_BYTES + 1, `${VALID_HEADER}\n1,2,3`);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/10 MB/i);
  });

  it('rejects missing required header columns', () => {
    const res = validateCsvText(
      'bad.csv',
      500,
      'employee_id,first_name,email\nEMP-1,Asha,asha@agency.example'
    );
    expect(res.valid).toBe(false);
    expect(res.missingColumns).toEqual(['last_name', 'department', 'date_of_joining']);
  });

  it('rejects header-only CSV with no data rows', () => {
    const res = validateCsvText('header-only.csv', 120, `${VALID_HEADER}\n   \n`);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/no employee data rows/i);
  });

  it('handles UTF-8 BOM and accepts required-only header with data', () => {
    const text = `\uFEFF${REQUIRED_ONLY_HEADER}\nEMP-00001,Asha,Sharma,asha@agency.example,HR,2020-01-15`;
    const res = validateCsvText('valid.csv', text.length, text);
    expect(res.valid).toBe(true);
  });
});
