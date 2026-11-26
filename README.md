# HR Bulk Employee Upload UI

**Developer:** Aakash Deep ([github.com/eraakashdeep](https://github.com/eraakashdeep))  
**Organization:** eGov Foundation — Bulk Upload Status & Error Report UI

> It is deployed and Lived on : [https://egov-bulk-upload-ui.vercel.app](https://egov-bulk-upload-ui.vercel.app)

A React + TypeScript application and containerized stack for uploading large employee CSVs (500–50,000 rows), tracking asynchronous job progress with resilient polling, inspecting errors in a virtualized table, downloading spreadsheet-aligned error reports, comparing re-uploads against previous runs, and browsing the paginated employee directory.

---

## Quick Start (Docker Compose)

From the repository root:

```bash
docker compose up --build
```

- **Open URL:** http://localhost:3000
- **Mock API:** http://localhost:8080 (automatically proxied by the web container at `/api/*`)

> On first start, `mock-api` generates the deterministic sample files (`upload-1.csv`, `upload-2-corrected.csv`, `stress-50000.csv`) into `./data`.

---

## Local Development (Without Docker)

1. Start the mock backend (`Node >= 18`):
   ```bash
   node mock-api/server.js
   ```
2. In a second terminal, install frontend dependencies and run the Vite dev server:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
3. Open **http://localhost:3000** (Vite proxies `/api/*` to `http://localhost:8080`).

---

## Running Tests & Build

From the repository root (with frontend dependencies installed):

```bash
npm test
```

Or inside `frontend/`:

```bash
cd frontend
npm test
```

Typecheck and production bundle build:

```bash
npm run build
```

---

## Chaos Modes

The mock API supports four behavior modes:

| Mode | Behavior |
|---|---|
| `none` | Normal processing (~8s for 12,000 rows after a short queued phase). |
| `slow-processing` | Queue and processing durations are 4× longer. |
| `status-500-once` | The 2nd `GET /uploads/{id}` poll returns HTTP `500`; subsequent polls succeed. |
| `job-failed` | Processing stops at ~40% with `status: "failed"` (`GET /uploads/{id}/errors` returns `409`). |

### How to Switch Chaos Modes

1. **In the UI:** Use the **Mock Chaos Mode** selector in the top toolbar at http://localhost:3000 (calls `POST /admin/chaos`), or click **Reset Mock Data** (`POST /admin/reset`).
2. **At Docker startup:**
   ```bash
   CHAOS_MODE=status-500-once docker compose up --build
   ```
3. **Via `curl` at runtime:**
   ```bash
   curl -X POST http://localhost:8080/admin/chaos \
     -H "Content-Type: application/json" \
     -d '{"mode":"job-failed"}'
   ```

---

## Key Documentation

- [spec.md](./spec.md) — Restated problem, clarifying questions, resolved ambiguities (`row + 2` convention), and scope boundaries.
- [plan.md](./plan.md) — 4-hour milestones, what was cut for the time box, architecture, and test strategy.
- [ai-log.md](./ai-log.md) — How I directed the AI coding assistant, my prompts/analysis, and where the AI was wrong.
