# AI Collaboration Log (`ai-log.md`)

**Candidate:** Aakash Deep ([github.com/eraakashdeep](https://github.com/eraakashdeep))  
**AI Tool Used:** Gemini

---

## How I Approached & Directed the AI

Rather than pasting the prompt blindly and accepting generated boilerplate, I drove the implementation in four deliberate engineering stages:

### 1. Codebase & Backend Audit First (My Analysis Before Coding)
Before generating any UI code, I had the assistant inspect `BRIEF.md`, `mock-api/server.js`, and `mock-api/generate.js` alongside me so we worked from exact server contracts rather than assumptions. Key findings I flagged upfront:
- `server.js` emits `row` as a **0-based index into data rows** (header excluded), and `?format=csv` streams that raw 0-based index—meaning an HR admin opening the CSV in Excel would be off by 2 rows unless the frontend maps `row -> row + 2`.
- `server.js` returns HTTP `500` on the 2nd status poll in `status-500-once` mode, so naive polling would falsely fail the upload.
- Standard `fetch` cannot emit request-body upload progress; `XMLHttpRequest` is needed for real upload progress.
- `mock-api` has no `/diff` endpoint, so run-over-run comparison had to be designed client-side.
- Only 6 columns are strictly `REQUIRED` in `server.js` (`designation` and `phone` are optional columns, though non-empty `phone` must be 10 digits).

### 2. Spec-Driven Prompting (`spec.md` & `plan.md` First)
I instructed the assistant to formalize our resolved decisions into `spec.md` and `plan.md` before scaffolding React:
- Lock in `spreadsheetRow = serverRow + 2` across both the UI grid and client-built RFC-4180 CSV downloads.
- Scope the 4-hour budget explicitly (custom zero-dependency virtualized error table instead of a heavy grid library; bounded `localStorage` instead of IndexedDB; no browser-side CSV cell editor).

### 3. Targeted Implementation Prompts
I directed implementation module by module so each unit stayed clean, typed, and testable:
1. **Pure utilities first:** `csvPreflight.ts` (128 KB slice header check with BOM stripping), `rowMapping.ts` (`+2` offset + RFC-4180 CSV generator), `runDiff.ts` (row-based Fixed / Still Failing / New Issues), `storage.ts`.
2. **Networking & state machine:** `client.ts` (`XHR` upload progress + typed `ApiError`) and `useJobPoller.ts` (exponential backoff, `5xx` retry up to 5 attempts, `AbortController` + `clearTimeout` cleanup on unmount).
3. **UI & Polish:** `UploadPage` owning `useJobPoller` (so navigating to `EmployeeDirectory` unmounts and cleans up polling while `localStorage` restores `activeJobId` on return or refresh), `VirtualErrorTable`, `RunSummaryAndDiff`, `ChaosToolbar`, `AboutModal` (with GitHub attribution), footer, and a clean gov-tech CSS theme.

### 4. Test & Build Verification Loop
I required Vitest + React Testing Library coverage specifically targeting the failure-prone parts—polling backoff, `500` recovery, unmount cleanup, `row + 2` mapping, CSV pre-flight edge cases, run diffing, server pagination, and refresh restoration—followed by `tsc -b && vite build`.

---

## Where the AI Was Wrong & How I Caught It

1. **Assumed `Blob.slice().text()` worked in `jsdom`:** The AI wrote `await headSlice.text()` inside `validateCsvFile()`, which passed typechecking but failed in `npm test` with `"Could not read the selected file"` because `jsdom`'s `Blob` slice does not implement `.text()`. I caught this on the first test run and had it add a `FileReader` fallback.
2. **Omitted Vite client types in `tsconfig.json`:** Setting an explicit `"types": ["vitest/globals", "@testing-library/jest-dom"]` array caused `npm run build` (`tsc -b`) to fail on `import.meta.env.VITE_API_URL` (`TS2339`); I caught it during the production build check and added `src/vite-env.d.ts`.
3. **Missed Node 26 `localStorage` behavior in the test environment:** In Node 26 without `--localstorage-file`, `window.localStorage` was `undefined` under `jsdom`, breaking the refresh-restoration test with a `TypeError`; I caught it via `npm test` and added an in-memory `Storage` polyfill in `src/test/setup.ts`.
4. **Nginx proxy default body size & direct server CSV assumption:** Left unreviewed, Nginx's default `1m` `client_max_body_size` would have rejected valid 2–10 MB CSV uploads with HTTP `413`, and linking directly to `GET /uploads/{id}/errors?format=csv` would have exported 0-based `row` numbers; I caught both during architecture review and fixed them via `client_max_body_size 15m;` in `nginx.conf` and client-side CSV generation (`row + 2`).
