# Specification: Bulk Upload Status and Error Report UI

**Author:** Aakash Deep ([github.com/eraakashdeep](https://github.com/eraakashdeep))  
**Target Domain:** eGov Foundation — HR Bulk Employee Ingestion Console

---

## 1. Problem Statement

HR administrators upload employee spreadsheets containing **500 to 50,000 rows** (up to 10 MB CSV files) into an asynchronous backend (`mock-api`). Because processing takes several seconds (and significantly longer under degraded conditions), the frontend must:

1. Validate CSV basics on the client (`.csv` extension, `<= 10 MB`, non-empty data, required columns) via drag-and-drop or file picker before transmitting data.
2. Stream real upload byte progress, then poll `GET /uploads/{id}` (`queued` -> `processing` with `processed/totalRows` -> `completed` or `failed`) using backoff, surviving transient HTTP 500s, and cleaning up timers/requests if the user navigates away.
3. Persist active job tracking across browser refreshes and recover gracefully if the in-memory backend restarts (`404 job_not_found`).
4. Present a clear result summary (`loaded`, `rejected`, `duplicate`) and a smooth, virtualized, filterable table of rejected and duplicate rows.
5. Export a per-row CSV error report whose row numbers match what the admin sees when opening the source CSV in Excel, Google Sheets, or LibreOffice Calc.
6. Support re-uploading a corrected CSV and clearly show what changed compared with the previous run.
7. Provide an Employee Directory with server-side pagination (`GET /employees?page=&pageSize=`).

---

## 2. Clarifying Questions Identified Before Implementation

Before writing UI code, I audited `BRIEF.md`, `mock-api/server.js`, and `mock-api/generate.js` and surfaced the following ambiguities (the same batch a candidate would confirm early with the team):

1. **Row-Numbering Offset:** `server.js` emits `row` as a 0-based index among *data* rows (`0` = first employee record), whereas `?format=csv` streams that raw `0`-based index. Should the UI and downloaded CSV report shift to **1-based spreadsheet line numbers (`row + 2`)** so row `1` corresponds to the header?
2. **Re-upload Diff Matching:** `mock-api` has no diff endpoint, and rejected rows can have empty or duplicate `employee_id` values. Should run-to-run diffs match by **row position** (assuming admins fix spreadsheets in place, as in `upload-2-corrected.csv`) or solely by `employee_id`?
3. **Transient `status-500-once` Handling:** In `status-500-once` mode, the 2nd status poll returns HTTP `500`. How many consecutive `5xx` retries should the UI tolerate before surfacing a terminal failure?
4. **Optional vs. Required Columns:** `server.js` enforces 6 `REQUIRED` columns (`employee_id, first_name, last_name, email, department, date_of_joining`), while `designation` and `phone` are optional (except `phone` must be 10 digits if non-empty). Should client-side pre-flight allow CSVs that omit `designation` or `phone`?
5. **Employee Directory Scope:** `GET /employees` supports `page` and `pageSize` (1..200) without search or sort parameters. Should the directory remain strictly server-paginated without misleading client-only search over a single page?

---

## 3. Ambiguities Found & Engineering Resolutions

### 3.1 Row-Numbering Convention: `spreadsheetRow = serverRow + 2`
- **Observation:** In `mock-api/server.js` (line 3 & line 108), `row` is `index` from `data.forEach((cells, index) => ...)`, where `data = rows.slice(1)`. Thus `row = 0` is the first employee record.
- **Decision:** Every error row displayed in the UI table and exported in the downloaded CSV error report uses **`spreadsheetRow = serverRow + 2`**:
  - Row `1` in Excel / Google Sheets / LibreOffice is the header (`employee_id,first_name,...`).
  - Data index `0` is therefore **Row `2`**.
- **Tradeoff / Assumption:** Assumes one physical line per CSV record (no embedded newlines inside quoted fields). None of the generated datasets contain multi-line quoted cells.

### 3.2 Client-Transformed Error Report Download
- **Observation:** Hitting `GET /uploads/{id}/errors?format=csv` directly downloads `0`-based server `row` numbers, which confuses an HR admin trying to fix row `2` in Excel.
- **Decision:** Fetch the completed error list via `GET /uploads/{id}/errors` and generate an RFC-4180-escaped CSV client-side (`buildErrorReportCsv`) with `row` mapped to `serverRow + 2`, preserving the exact schema (`row,employee_id,type,field,code,reason`). Both **Download Error Report (CSV)** (all errors) and **Download Filtered** (active filter subset) are offered.

### 3.3 Fast O(Header) Client-Side Pre-Flight Validation
- **Decision:** Before starting an upload, `csvPreflight.ts` validates:
  1. Filename ends in `.csv` (case-insensitive).
  2. Size is `> 0` bytes and `<= 10 MB` (`10 * 1024 * 1024`).
  3. Reads only the first `128 KB` slice (`File.slice` with `FileReader` fallback), strips any UTF-8 BOM (`0xFEFF`), parses the header row cleanly, verifies all 6 required columns (`employee_id, first_name, last_name, email, department, date_of_joining`), and checks that at least one non-empty data row exists.
- **Reasoning:** Avoids blocking the UI thread parsing 50,000 rows twice while catching schema/type/size mistakes instantaneously. `designation` and `phone` remain optional in header checks to match `server.js`.

### 3.4 Upload Progress & Resilient Polling State Machine
- **Upload Progress:** `fetch()` does not emit request-body upload progress, so `uploadCsv()` uses `XMLHttpRequest` (`xhr.upload.onprogress`) for real `0–100%` transfer feedback before transitioning to polling.
- **Polling & Backoff:** `useJobPoller` starts at `600ms` and applies exponential backoff (`1.35x`, capped at `3000ms` during normal processing; `1.5x` up to `4000ms` on transient errors).
- **`status-500-once` Recovery:** HTTP `5xx` and transient network errors retry up to 5 consecutive times with a non-blocking warning banner instead of aborting the job. `status === 'failed'`, `status === 'completed'`, and `404 job_not_found` are terminal.
- **Cleanup on Leave:** Navigating to **Employee Directory** unmounts `UploadPage`, triggering `useJobPoller`'s cleanup effect to `clearTimeout` and `AbortController.abort()` any in-flight poll. Returning to **Bulk Upload & Errors** (or refreshing the page) restores `activeJobId` from `localStorage` and resumes polling.

### 3.5 Re-Upload Diff Engine (`compareRuns`)
- **Decision:** Keep a snapshot of the previous completed run (`summary` + `errors`). On re-upload completion, `compareRuns()` calculates summary deltas (`loaded`, `rejected`, `duplicate`) and classifies row-level changes by `row` index:
  - **Fixed:** present in previous errors, absent in current errors (within `current.totalRows`).
  - **Still Failing:** present at the same `row` in both runs (highlighting if the error `code`/`field`/`type` changed).
  - **New Issues:** absent in previous errors, present in current errors.
- **Reasoning:** Admins fix spreadsheets in place (`upload-2-corrected.csv`), so `row`-indexed diffing works reliably even when an earlier row had a blank or duplicate `employee_id`.

### 3.6 Virtualized Error Table & Server-Paginated Employee Directory
- **Error Table:** Windowed viewport (`ROW_HEIGHT = 44px`, `VIEWPORT_HEIGHT = 440px`, overscan `8`) renders only visible rows so `stress-50000.csv` (~2,500 errors) or up to 50,000 errors filter and scroll smoothly with zero third-party grid dependencies.
- **Employee Directory:** Uses `GET /employees?page=&pageSize=` (page sizes `25`, `50`, `100`, `200`) with First/Prev/Next/Last controls and auto-refreshes when an upload finishes.
- **Mock API Controls:** Includes a compact toolbar calling `GET|POST /admin/chaos` and `POST /admin/reset` so reviewers can verify `slow-processing`, `status-500-once`, and `job-failed` directly in the browser.

---

## 4. Explicitly Out of Scope

- Authentication, authorization, or multi-user job isolation.
- Persistent backend database storage (`mock-api` keeps jobs and employees in memory).
- In-browser spreadsheet editing or patching CSV files in the UI.
- Server-side search/sorting on `/employees` (not exposed by `mock-api`).
- WebSockets / Server-Sent Events (backend is polling-only).
- Physical line-number recalculation for multi-line quoted CSV fields.
