import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { UploadErrorItem } from '../types';
import { saveActiveJob } from '../utils/storage';
import { EmployeeDirectory } from './EmployeeDirectory';
import { UploadDropzone } from './UploadDropzone';
import { VirtualErrorTable } from './VirtualErrorTable';

describe('UploadDropzone', () => {
  it('blocks non-csv files client-side without calling onFileAccepted', async () => {
    const onAccepted = vi.fn();
    render(
      <UploadDropzone
        disabled={false}
        isUploading={false}
        uploadPercent={0}
        hasPreviousRun={false}
        onFileAccepted={onAccepted}
      />
    );

    const input = screen.getByTestId('csv-file-input') as HTMLInputElement;
    const badFile = new File(['hello'], 'staff.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [badFile] } });

    expect(await screen.findByRole('alert')).toHaveTextContent(/Only \.csv files/i);
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('accepts valid CSV with required headers', async () => {
    const onAccepted = vi.fn();
    render(
      <UploadDropzone
        disabled={false}
        isUploading={false}
        uploadPercent={0}
        hasPreviousRun={false}
        onFileAccepted={onAccepted}
      />
    );

    const input = screen.getByTestId('csv-file-input') as HTMLInputElement;
    const csvContent =
      'employee_id,first_name,last_name,email,department,date_of_joining\nEMP-00001,Asha,Sharma,asha@agency.example,HR,2020-01-01\n';
    const goodFile = new File([csvContent], 'good.csv', { type: 'text/csv' });

    fireEvent.change(input, { target: { files: [goodFile] } });

    await waitFor(() => {
      expect(onAccepted).toHaveBeenCalledWith(goodFile);
    });
  });
});

describe('VirtualErrorTable', () => {
  const sampleErrors: UploadErrorItem[] = [
    {
      row: 0,
      employee_id: 'EMP-00001',
      type: 'rejected',
      field: 'email',
      code: 'INVALID_EMAIL',
      reason: 'email is not a valid address',
    },
    {
      row: 100,
      employee_id: 'EMP-00001',
      type: 'duplicate',
      field: 'employee_id',
      code: 'DUPLICATE_ID',
      reason: 'employee_id appears earlier in this file',
    },
  ];

  it('renders spreadsheet row numbers (row + 2) and filters by type and search query', () => {
    render(
      <VirtualErrorTable
        jobId="job-xyz"
        errors={sampleErrors}
        loading={false}
        loadError={null}
      />
    );

    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#102')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Filter by error type/i), {
      target: { value: 'duplicate' },
    });

    expect(screen.queryByText('#2')).not.toBeInTheDocument();
    expect(screen.getByText('#102')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Filter by error type/i), {
      target: { value: 'all' },
    });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. 245/i), {
      target: { value: 'INVALID_EMAIL' },
    });

    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.queryByText('#102')).not.toBeInTheDocument();
  });
});

describe('EmployeeDirectory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests server-paginated employees and navigates pages', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const isPage2 = url.includes('page=2');
      return new Response(
        JSON.stringify({
          page: isPage2 ? 2 : 1,
          pageSize: 50,
          total: 80,
          totalPages: 2,
          items: [
            {
              employee_id: isPage2 ? 'SEED-0051' : 'SEED-0001',
              first_name: 'Seed',
              last_name: isPage2 ? 'Employee 51' : 'Employee 1',
              email: isPage2 ? 'seed51@agency.example' : 'seed1@agency.example',
              department: 'HR',
              designation: 'Clerk',
              date_of_joining: '2015-01-01',
              phone: '9000000000',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    render(<EmployeeDirectory refreshSignal={0} />);

    expect(await screen.findByText('SEED-0001')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('SEED-0051')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('page=2&pageSize=50'),
      expect.any(Object)
    );
  });
});

describe('App refresh restoration', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('restores activeJobId from localStorage on mount and resumes polling', async () => {
    saveActiveJob({
      jobId: 'job-restored',
      filename: 'upload-1.csv',
      savedAt: '2026-11-26T10:00:00Z',
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/admin/chaos')) {
        return new Response(JSON.stringify({ mode: 'none', modes: ['none'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/uploads/job-restored/errors')) {
        return new Response(
          JSON.stringify({ jobId: 'job-restored', total: 0, offset: 0, limit: 0, items: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/uploads/job-restored')) {
        return new Response(
          JSON.stringify({
            id: 'job-restored',
            filename: 'upload-1.csv',
            status: 'completed',
            totalRows: 10,
            processed: 10,
            createdAt: '2026-11-26T10:00:00Z',
            summary: { loaded: 10, rejected: 0, duplicate: 0 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('{}', { status: 404 });
    });

    render(<App />);

    expect(await screen.findByText(/Zero errors found/i)).toBeInTheDocument();
    expect(screen.getAllByText(/upload-1\.csv/).length).toBeGreaterThan(0);
  });

  it('renders eGov Foundation footer and opens About modal with developer GitHub link', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ mode: 'none', modes: ['none'] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<App />);

    expect(screen.getByText(/© 2026 eGov Foundation/i)).toBeInTheDocument();
    expect(screen.getByText('Aakash Deep')).toBeInTheDocument();

    const ghFooterLink = screen.getByRole('link', { name: /github\.com\/eraakashdeep/i });
    expect(ghFooterLink).toHaveAttribute('href', 'https://github.com/eraakashdeep');

    fireEvent.click(screen.getByRole('button', { name: /About application and developer/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Aakash Deep');
    expect(screen.getByRole('link', { name: /@eraakashdeep/i })).toHaveAttribute(
      'href',
      'https://github.com/eraakashdeep'
    );

    fireEvent.click(screen.getByRole('button', { name: /Close about dialog/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
