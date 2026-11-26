export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type ChaosMode = 'none' | 'slow-processing' | 'status-500-once' | 'job-failed';

export interface JobSummary {
  loaded: number;
  rejected: number;
  duplicate: number;
}

export interface JobErrorInfo {
  code: string;
  message: string;
}

export interface JobView {
  id: string;
  jobId?: string;
  filename: string;
  status: JobStatus;
  totalRows: number;
  processed: number;
  createdAt: string;
  summary?: JobSummary;
  error?: JobErrorInfo;
}

export type ErrorType = 'rejected' | 'duplicate';

export interface UploadErrorItem {
  /** 0-based index among data rows returned by the backend */
  row: number;
  employee_id: string;
  type: ErrorType;
  field: string;
  code: string;
  reason: string;
}

export interface ErrorsResponse {
  jobId: string;
  total: number;
  offset: number;
  limit: number;
  items: UploadErrorItem[];
}

export interface Employee {
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
  designation: string;
  date_of_joining: string;
  phone: string;
}

export interface EmployeesResponse {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: Employee[];
}

export interface RunSnapshot {
  jobId: string;
  filename: string;
  completedAt: string;
  totalRows: number;
  summary: JobSummary;
  errors: UploadErrorItem[];
  errorsTruncated?: boolean;
}

export interface StillFailingItem {
  previous: UploadErrorItem;
  current: UploadErrorItem;
  changedReason: boolean;
}

export interface RunDiff {
  previousJobId: string;
  previousFilename: string;
  currentJobId: string;
  currentFilename: string;
  summaryDelta: {
    totalRows: number;
    loaded: number;
    rejected: number;
    duplicate: number;
  };
  fixed: UploadErrorItem[];
  removedOutOfRange: UploadErrorItem[];
  stillFailing: StillFailingItem[];
  newlyIntroduced: UploadErrorItem[];
  comparisonReliable: boolean;
}
