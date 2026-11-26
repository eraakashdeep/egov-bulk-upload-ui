# Mock API: bulk upload status and error report

A dependency-free Node server (Node 18 or newer) that plays the role of the HR bulk-upload backend. Jobs live in memory, so restarting the container clears them.

## Start it

From this folder:

```
docker compose up --build
```

The API listens on http://localhost:8080. On first start it writes the three sample files into ../data (upload-1.csv, upload-2-corrected.csv, stress-50000.csv). To generate them without Docker run `node generate.js`. The files are deterministic and must be used as-is.

In your own root docker-compose.yml, add this folder as a service (build: ./mock-api, port 8080, volume ./data:/data) next to your React app.

## Endpoints

**POST /uploads**: multipart/form-data with a file field (the filename must end in .csv, maximum 10 MB). Returns 202 with { jobId, id, status, totalRows, processed, createdAt }. Errors: 415 unsupported_type, 413 file_too_large, 400 missing_columns (with a missing list) or empty_file.

**GET /uploads/{id}**: job status. status is queued, processing, completed or failed. While processing, processed and totalRows give progress. When completed the response includes summary { loaded, rejected, duplicate }. When failed it includes error { code, message }.

**GET /uploads/{id}/errors**: available once the job is completed (409 job_not_completed before that). JSON by default: { jobId, total, offset, limit, items }. Each item has row, employee_id, type (rejected or duplicate), field, code and reason. Optional query parameters: type, code, q (text search), offset, limit. Add ?format=csv, or send Accept: text/csv, for a CSV download with the columns row, employee_id, type, field, code, reason.

**GET /employees?page=&pageSize=**: server-side pagination, 1-based page, default pageSize 50, maximum 200. Returns { page, pageSize, total, totalPages, items }. About 237 seed employees exist at start, and loaded rows from completed jobs are added or replaced by employee_id.

The `row` field is the position of the row among the data rows as the server counts them. Decide for yourself how to present it to the admin, and write that decision in spec.md.

A row is rejected when a required field is empty (employee_id, first_name, last_name, email, department, date_of_joining), the email is malformed, the date is not a real past date in YYYY-MM-DD form, or the phone is not 10 digits. A row is a duplicate when its employee_id already appeared earlier in the same file.

## Chaos modes

Set at start with the CHAOS_MODE environment variable, for example `CHAOS_MODE=job-failed docker compose up`. Switch at runtime with POST /admin/chaos and a JSON body such as { "mode": "job-failed" }. GET /admin/chaos shows the current mode. A job uses the mode that was active when it was uploaded.

**none**: normal behaviour. A 12,000-row file takes about 8 seconds after a short queued phase.

**slow-processing**: the queued phase and the processing time are four times longer.

**status-500-once**: the second status request for each job returns a 500, later requests succeed.

**job-failed**: the job stops at about 40% with status failed and an error object. The errors endpoint returns 409.

POST /admin/reset clears all jobs and restores the seed employees.

## Other

GET /health returns { ok: true, chaos }. CORS is open for all origins.
