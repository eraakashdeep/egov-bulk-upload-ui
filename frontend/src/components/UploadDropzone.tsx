import React, { useRef, useState } from 'react';
import { validateCsvFile } from '../utils/csvPreflight';

interface UploadDropzoneProps {
  disabled: boolean;
  isUploading: boolean;
  uploadPercent: number;
  hasPreviousRun: boolean;
  previousFilename?: string;
  onFileAccepted: (file: File) => void;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  disabled,
  isUploading,
  uploadPercent,
  hasPreviousRun,
  previousFilename,
  onFileAccepted,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file || disabled || isUploading) return;
    setValidationError(null);
    setSelectedName(file.name);
    setChecking(true);

    try {
      const result = await validateCsvFile(file);
      if (!result.valid) {
        setValidationError(result.error || 'Invalid CSV file.');
        return;
      }
      onFileAccepted(file);
    } catch {
      setValidationError('Could not read the selected file.');
    } finally {
      setChecking(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled || isUploading) return;
    const file = e.dataTransfer.files?.[0];
    void handleFile(file);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    void handleFile(file);
    // Reset input so re-selecting the exact same filename triggers onChange
    e.target.value = '';
  };

  return (
    <section className="card" aria-labelledby="upload-heading">
      <div className="card-header">
        <div>
          <h2 id="upload-heading">
            {hasPreviousRun ? 'Upload or Re-upload Employee CSV' : 'Upload Employee CSV'}
          </h2>
          <p className="muted">
            {hasPreviousRun
              ? `Previous run: ${previousFilename}. Upload a corrected CSV to compare fixed and remaining errors.`
              : 'Accepts .csv files up to 10 MB with required columns: employee_id, first_name, last_name, email, department, date_of_joining.'}
          </p>
        </div>
      </div>

      <div
        role="button"
        tabIndex={disabled || isUploading ? -1 : 0}
        aria-disabled={disabled || isUploading}
        aria-label="Drop CSV file here or click to browse"
        className={`dropzone ${isDragging ? 'dropzone--active' : ''} ${
          disabled || isUploading ? 'dropzone--disabled' : ''
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => {
          if (!disabled && !isUploading) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled && !isUploading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          data-testid="csv-file-input"
          onChange={onInputChange}
          disabled={disabled || isUploading}
        />

        {isUploading ? (
          <div className="upload-progress-box">
            <div className="progress-label-row">
              <span>Uploading {selectedName ?? 'file'}...</span>
              <strong>{uploadPercent}%</strong>
            </div>
            <div className="progress-track" role="progressbar" aria-valuenow={uploadPercent} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill" style={{ width: `${uploadPercent}%` }} />
            </div>
          </div>
        ) : checking ? (
          <p className="dropzone-title">Checking CSV headers and file size...</p>
        ) : (
          <>
            <div className="dropzone-icon" aria-hidden="true">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="dropzone-title">
              Drag &amp; drop a <code>.csv</code> file here, or <span className="link-text">browse</span>
            </p>
            <p className="dropzone-subtitle">
              Client-side pre-flight validates file type, 10 MB max size, non-empty data, and required headers before uploading.
            </p>
          </>
        )}
      </div>

      {validationError && (
        <div className="alert alert--error" role="alert">
          <strong>Pre-flight check failed:</strong> {validationError}
        </div>
      )}
    </section>
  );
};
