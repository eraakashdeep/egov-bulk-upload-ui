'use strict';
// Mock backend for the kit-5 bulk upload take-home. No dependencies: plain Node (>= 18).
// Row numbers: every error carries `row`, the 0-based index of the row among the DATA rows (the header is not counted).
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { ensure } = require('./generate');

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const MAX_BYTES = 10 * 1024 * 1024;
const REQUIRED = ['employee_id', 'first_name', 'last_name', 'email', 'department', 'date_of_joining'];
const MODES = ['none', 'slow-processing', 'status-500-once', 'job-failed'];
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Filename',
  'Access-Control-Expose-Headers': 'Content-Disposition,Location'
};

let chaos = MODES.includes(process.env.CHAOS_MODE) ? process.env.CHAOS_MODE : 'none';
const jobs = new Map();
const employees = new Map();

function seedEmployees() {
  employees.clear();
  for (let i = 1; i <= 237; i++) {
    const id = 'SEED-' + String(i).padStart(4, '0');
    employees.set(id, { employee_id: id, first_name: 'Seed', last_name: 'Employee ' + i, email: 'seed' + i + '@agency.example', department: 'HR', designation: 'Clerk', date_of_joining: '2015-01-01', phone: '9000000000' });
  }
}

// ---------- CSV parsing and validation ----------
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return d;
}

function validateRow(rec) {
  for (const f of REQUIRED) {
    if (!rec[f]) return { field: f, code: 'REQUIRED', reason: f + ' is required' };
  }
  if (!EMAIL_RE.test(rec.email)) return { field: 'email', code: 'INVALID_EMAIL', reason: 'email is not a valid address' };
  const d = parseDate(rec.date_of_joining);
  if (!d) return { field: 'date_of_joining', code: 'INVALID_DATE', reason: 'date_of_joining must be a real date in YYYY-MM-DD format' };
  if (d.getTime() > Date.now()) return { field: 'date_of_joining', code: 'DATE_IN_FUTURE', reason: 'date_of_joining cannot be in the future' };
  if (rec.phone && !/^\d{10}$/.test(rec.phone)) return { field: 'phone', code: 'INVALID_PHONE', reason: 'phone must be 10 digits' };
  return null;
}

function analyse(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { error: 'empty_file' };
  const header = rows[0].map((h) => h.trim());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) return { error: 'missing_columns', missing };
  const data = rows.slice(1);
  if (!data.length) return { error: 'empty_file' };
  const seen = new Set();
  const errors = [];
  const loaded = [];
  data.forEach((cells, index) => {
    const rec = {};
    header.forEach((h, c) => {
      rec[h] = (cells[c] || '').trim();
    });
    const problem = validateRow(rec);
    if (problem) errors.push(Object.assign({ row: index, employee_id: rec.employee_id, type: 'rejected' }, problem));
    else if (seen.has(rec.employee_id)) errors.push({ row: index, employee_id: rec.employee_id, type: 'duplicate', field: 'employee_id', code: 'DUPLICATE_ID', reason: 'employee_id appears earlier in this file' });
    else loaded.push(rec);
    if (rec.employee_id) seen.add(rec.employee_id);
  });
  return { totalRows: data.length, errors, loaded };
}

// ---------- multipart parsing ----------
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return null;
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const next = buf.indexOf(boundary, pos + boundary.length);
    if (next === -1) break;
    const part = buf.subarray(pos + boundary.length, next);
    const split = part.indexOf('\r\n\r\n');
    if (split !== -1) {
      const head = part.subarray(0, split).toString('utf8');
      const fn = /filename="([^"]*)"/i.exec(head);
      if (fn) {
        let body = part.subarray(split + 4);
        if (body.length >= 2 && body[body.length - 2] === 13 && body[body.length - 1] === 10) body = body.subarray(0, body.length - 2);
        return { filename: fn[1], content: body };
      }
    }
    pos = next;
  }
  return null;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size <= limit) chunks.push(c);
    });
    req.on('end', () => (size > limit ? reject(new Error('too_large')) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

// ---------- responses ----------
function send(res, status, body, headers) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS, headers || {}));
  res.end(data);
}

function csvCell(v) {
  const s = String(v === undefined || v === null ? '' : v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ---------- jobs ----------
function advance(job) {
  if (job.status === 'completed' || job.status === 'failed') return;
  const elapsed = Date.now() - job.createdAt;
  if (elapsed < job.queuedMs) {
    job.status = 'queued';
    job.processed = 0;
    return;
  }
  const frac = (elapsed - job.queuedMs) / job.durationMs;
  if (job.mode === 'job-failed' && frac >= 0.4) {
    job.status = 'failed';
    job.processed = Math.floor(job.totalRows * 0.4);
    job.error = { code: 'PROCESSING_ERROR', message: 'Processing stopped unexpectedly. Please upload the file again.' };
    return;
  }
  if (frac >= 1) {
    job.status = 'completed';
    job.processed = job.totalRows;
    job.summary = { loaded: job.loaded.length, rejected: job.errors.filter((e) => e.type === 'rejected').length, duplicate: job.errors.filter((e) => e.type === 'duplicate').length };
    // Upsert by employee_id: re-uploading a corrected file replaces rows, it never flags them as duplicates of themselves.
  job.loaded.forEach((rec) => employees.set(rec.employee_id, rec));
    return;
  }
  job.status = 'processing';
  // Never report processed === total until the job is really completed.
job.processed = Math.max(0, Math.min(job.totalRows - 1, Math.floor(job.totalRows * frac)));
}

function view(job) {
  advance(job);
  const out = { id: job.id, filename: job.filename, status: job.status, totalRows: job.totalRows, processed: job.processed, createdAt: new Date(job.createdAt).toISOString() };
  if (job.status === 'completed') out.summary = job.summary;
  if (job.status === 'failed') out.error = job.error;
  return out;
}

async function handleUpload(req, res, url) {
  let buf;
  try {
    buf = await readBody(req, MAX_BYTES + 65536);
  } catch (e) {
    return send(res, 413, { error: 'file_too_large', maxBytes: MAX_BYTES });
  }
  const ct = req.headers['content-type'] || '';
  let filename;
  let content;
  if (/multipart\/form-data/i.test(ct)) {
    const part = parseMultipart(buf, ct);
    if (!part) return send(res, 400, { error: 'no_file', message: 'Send the CSV as a multipart field with a filename' });
    filename = part.filename;
    content = part.content;
  } else {
    filename = req.headers['x-filename'] || url.searchParams.get('filename') || 'upload.csv';
    content = buf;
  }
  if (!/\.csv$/i.test(filename)) return send(res, 415, { error: 'unsupported_type', message: 'Only .csv files are accepted' });
  if (content.length > MAX_BYTES) return send(res, 413, { error: 'file_too_large', maxBytes: MAX_BYTES });
  const result = analyse(content.toString('utf8'));
  if (result.error) return send(res, 400, { error: result.error, missing: result.missing });
  const rate = chaos === 'slow-processing' ? 4 : 1;
  const job = {
    id: 'job-' + crypto.randomBytes(4).toString('hex'),
    filename,
    mode: chaos,
    createdAt: Date.now(),
    queuedMs: 1500 * rate,
    durationMs: Math.max(4000, result.totalRows / 1.5) * rate,
    status: 'queued',
    processed: 0,
    polls: 0,
    totalRows: result.totalRows,
    errors: result.errors,
    loaded: result.loaded
  };
  jobs.set(job.id, job);
  send(res, 202, Object.assign({ jobId: job.id }, view(job)), { Location: '/uploads/' + job.id });
}

function handleErrors(res, job, url) {
  advance(job);
  if (job.status !== 'completed') return send(res, 409, { error: 'job_not_completed', status: job.status });
  const q = url.searchParams;
  let items = job.errors;
  if (q.get('type')) items = items.filter((e) => e.type === q.get('type'));
  if (q.get('code')) items = items.filter((e) => e.code === q.get('code'));
  if (q.get('q')) {
    const needle = q.get('q').toLowerCase();
    items = items.filter((e) => (e.employee_id + ' ' + e.field + ' ' + e.reason).toLowerCase().includes(needle));
  }
  const total = items.length;
  const offset = Math.max(0, parseInt(q.get('offset') || '0', 10) || 0);
  const limit = q.get('limit') ? Math.min(50000, Math.max(1, parseInt(q.get('limit'), 10) || total)) : total;
  const slice = items.slice(offset, offset + limit);
  const wantsCsv = q.get('format') === 'csv' || /text\/csv/.test(url.accept || '');
  if (wantsCsv) {
    const cols = ['row', 'employee_id', 'type', 'field', 'code', 'reason'];
    const lines = [cols.join(',')].concat(slice.map((e) => cols.map((c) => csvCell(e[c])).join(',')));
    return send(res, 200, lines.join('\r\n') + '\r\n', { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="errors-' + job.id + '.csv"' });
  }
  send(res, 200, { jobId: job.id, total, offset, limit, items: slice });
}

function handleEmployees(res, url) {
  const q = url.searchParams;
  const page = Math.max(1, parseInt(q.get('page') || '1', 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(q.get('pageSize') || '50', 10) || 50));
  const all = Array.from(employees.values());
  const start = (page - 1) * pageSize;
  send(res, 200, { page, pageSize, total: all.length, totalPages: Math.max(1, Math.ceil(all.length / pageSize)), items: all.slice(start, start + pageSize) });
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  url.accept = req.headers.accept || '';
  const parts = url.pathname.split('/').filter(Boolean);
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, chaos });
  if (parts[0] === 'admin' && parts[1] === 'chaos') {
    if (req.method === 'GET') return send(res, 200, { mode: chaos, modes: MODES });
    if (req.method === 'POST') {
      let body = {};
      try {
        body = JSON.parse((await readBody(req, 65536)).toString('utf8') || '{}');
      } catch (e) {
        return send(res, 400, { error: 'invalid_json' });
      }
      if (!MODES.includes(body.mode)) return send(res, 400, { error: 'unknown_mode', modes: MODES });
      chaos = body.mode;
      return send(res, 200, { mode: chaos });
    }
  }
  if (req.method === 'POST' && url.pathname === '/admin/reset') {
    jobs.clear();
    seedEmployees();
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/uploads') return handleUpload(req, res, url);
  if (req.method === 'GET' && parts[0] === 'uploads' && parts[1]) {
    const job = jobs.get(parts[1]);
    if (!job) return send(res, 404, { error: 'job_not_found' });
    if (parts[2] === 'errors') return handleErrors(res, job, url);
    if (parts.length === 2) {
      job.polls++;
      if (job.mode === 'status-500-once' && job.polls === 2) return send(res, 500, { error: 'internal_error', message: 'Simulated one-off failure' });
      return send(res, 200, view(job));
    }
  }
  if (req.method === 'GET' && url.pathname === '/employees') return handleEmployees(res, url);
  send(res, 404, { error: 'not_found' });
}

seedEmployees();
ensure(DATA_DIR, (m) => console.log(m));
http
.createServer((req, res) => {
  route(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'internal_error' });
  });
})
.listen(PORT, '0.0.0.0', () => console.log('kit-5 mock API on :' + PORT + ' (chaos: ' + chaos + ', data: ' + DATA_DIR + ')'));
