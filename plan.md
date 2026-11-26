# Engineering Plan (`plan.md`)

**Author:** Aakash Deep ([github.com/eraakashdeep](https://github.com/eraakashdeep))  
**Time Box:** 4-hour hard cap

---

## 1. Time-Boxed Milestones & Execution

| Phase | Time Window | Scope & Deliverables | Status |
|---|---|---|---|
| **M1: Audit & Spec** | 0:00 – 0:30 | Read `BRIEF.md`, `mock-api/server.js`, and `generate.js`; lock down row numbering (`row + 2`), polling retry rules, and diff strategy in `spec.md` & `plan.md`. | Done |
| **M2: Core Utilities & Polling** | 0:30 – 1:15 | Scaffold Vite + React + TS; implement `csvPreflight`, `rowMapping`, `runDiff`, `storage`, XHR `uploadCsv`, and `useJobPoller` hook. | Done |
| **M3: UI & Visual Polish** | 1:15 – 2:35 | Build `UploadDropzone`, `JobProgressCard`, `RunSummaryAndDiff`, `VirtualErrorTable`, `EmployeeDirectory`, `ChaosToolbar`, `AboutModal`, footer, and gov-tech CSS styling. | Done |
| **M4: Automated Tests** | 2:35 – 3:20 | Write Vitest + RTL tests covering row mapping, CSV pre-flight, diffing, polling backoff/500-retry/unmount cleanup, virtualization filtering, pagination, and refresh recovery. | Done |
| **M5: Docker & Documentation** | 3:20 – 4:00 | Multi-stage `frontend/Dockerfile` + Nginx proxy (`client_max_body_size 15m`), root `docker-compose.yml`, `README.md`, and `ai-log.md`. | Done |

---

## 2. What Was Cut for the 4-Hour Cap (and Why)

Staying disciplined inside 4 hours meant prioritizing end-to-end reliability, correctness, and tests over secondary enhancements:

1. **IndexedDB Run History (Cut in favor of bounded `localStorage`):** Persisting 50,000-row error arrays in IndexedDB would survive hard browser refreshes even on giant error payloads, whereas `localStorage` is capped at ~2 MB in our wrapper (`errorsTruncated: true` fallback). Cut because in-session re-uploads keep full arrays in React state and typical runs (`upload-1.csv` ~600 errors, `stress-50000.csv` ~2,500 errors) already fit in `localStorage`.
2. **Web Worker CSV Pre-Scan (Cut in favor of 128 KB slice pre-flight):** Reading only the first 128 KB gives instant header + non-empty validation in O(1) memory without the build/bundling complexity of a Web Worker.
3. **Inline Row Fix Preview / Mini-Editor (Cut):** HR admins fix files in Excel/Sheets using the spreadsheet-aligned CSV download; building a browser CSV editor was out of proportion for 4 hours.
4. **Playwright Browser E2E Suite (Cut in favor of fast Vitest + RTL integration tests):** With Docker CLI unavailable on the local Windows machine and limited time, mocking `fetch` in RTL gave deterministic coverage of polling backoff, `500` retries, unmount cleanup, and `localStorage` refresh recovery within seconds.

---

## 3. Component & Data-Flow Architecture

```
App (state: tab, activeJobId, previousRun, currentRun, currentDiff, aboutOpen)
 ├── Top Header (Navigation Tabs + About Info Trigger -> AboutModal)
 ├── ChaosToolbar (GET/POST /admin/chaos, POST /admin/reset)
 ├── [Tab: Bulk Upload & Errors] -> UploadPage (unmounts on tab switch!)
 │     ├── UploadDropzone (csvPreflight 128KB check -> XHR upload progress)
 │     ├── JobProgressCard (status, processed/total, retry warning, terminal error)
 │     ├── useJobPoller (adaptive backoff, 5xx retry, AbortController + clearTimeout)
 │     ├── RunSummaryAndDiff (loaded/rejected/duplicate + Fixed / Still Failing / New)
 │     └── VirtualErrorTable (windowed rows, type/code/search filters, CSV export +2)
 ├── [Tab: Employee Directory] -> EmployeeDirectory (GET /employees?page=&pageSize=)
 └── Footer (© 2026 eGov Foundation · Developed by Aakash Deep · GitHub link)
```

### Key Architectural Choices
- **Unmount Cleanup by Design:** Placing `useJobPoller` inside `UploadPage` rather than globally in `App` ensures that switching away from the Upload page immediately aborts in-flight requests and clears polling timers, while `localStorage` (`bulk_upload_active_job_v1`) ensures switching back or refreshing the browser seamlessly resumes the active job.
- **Nginx Reverse Proxy (`/api/`):** In Docker, Nginx serves the built SPA on `:3000`, proxies `/api/*` to `http://mock-api:8080/`, and sets `client_max_body_size 15m` so 10 MB uploads are never blocked at the proxy layer before reaching `mock-api`.

---

## 4. API Contract Consumed

- `POST /uploads` (`multipart/form-data`, `file`) -> `202 { jobId, id, filename, status, totalRows, processed, createdAt }`
- `GET /uploads/{id}` -> `200 { id, filename, status, totalRows, processed, createdAt, summary?, error? }` | `500` (chaos) | `404`
- `GET /uploads/{id}/errors` -> `200 { jobId, total, offset, limit, items: UploadErrorItem[] }`
- `GET /employees?page=&pageSize=` -> `200 { page, pageSize, total, totalPages, items: Employee[] }`
- `GET /admin/chaos`, `POST /admin/chaos`, `POST /admin/reset`, `GET /health`

---

## 5. Test Strategy

Executed with **Vitest + React Testing Library (`jsdom`)**:
- `rowMapping.test.ts` — Verifies `0 -> 2` spreadsheet offset, `toDataRowNumber`, and RFC-4180 CSV escaping in generated reports.
- `csvPreflight.test.ts` — Verifies `.csv` enforcement, empty file rejection, `> 10 MB` rejection, missing required headers, UTF-8 BOM handling, and acceptance when optional columns (`designation`, `phone`) are omitted.
- `runDiff.test.ts` — Verifies summary deltas and Fixed / Still Failing / New Issues detection.
- `useJobPoller.test.tsx` — Uses fake timers to verify exponential backoff progression, survival across HTTP 500 on poll #2 (`status-500-once`), terminal `failed` handling, and timer/request cancellation on unmount.
- `UploadAndErrors.test.tsx` — Verifies client pre-flight alerts, virtualized error table filtering with `#row+2` rendering, server-paginated Employee Directory navigation, `localStorage` refresh restoration, About modal interaction, and footer attribution.

---

## 6. What I Would Do With One More Day

1. **Dockerized Playwright E2E Pipeline:** Boot `docker compose up` in CI and test `upload-1.csv` -> `upload-2-corrected.csv` -> `stress-50000.csv` plus all chaos modes against the real Node backend.
2. **IndexedDB Error Cache:** Store arbitrary-sized run error snapshots in IndexedDB so multi-run diffs survive hard refreshes even on 50,000-error stress uploads.
3. **Web Worker CSV Parser & Line Counter:** Count exact physical newlines when quoted multi-line cells exist so spreadsheet row numbers stay exact even for multi-line CSV cells.
4. **Row Context Preview:** Fetch/slice the matching raw CSV line from the browser `File` handle (when available in-session) so the admin can see the exact offending cell values alongside the server's reason.
