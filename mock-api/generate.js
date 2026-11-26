'use strict';
// Deterministic generator for the kit-5 sample files. Runs automatically on first start of the mock API
// when the files are missing from the data directory. Manual run: node generate.js [outputDir]
const fs = require('fs');
const path = require('path');

const HEADER = ['employee_id', 'first_name', 'last_name', 'email', 'department', 'designation', 'date_of_joining', 'phone'];
const FILES = ['upload-1.csv', 'upload-2-corrected.csv', 'stress-50000.csv'];
const FIRST = ['Asha', 'Ravi', 'Meera', 'Kiran', 'Sunil', 'Priya', 'Anil', 'Divya', 'Omar', 'Fatima', 'Joseph', 'Grace', 'Tariq', 'Lena', 'Mateo', 'Chen', 'Aiko', 'Nadia', 'Samuel', 'Ruth'];
const LAST = ['Sharma', 'Verma', 'Nair', 'Iyer', 'Khan', 'Das', 'Patel', 'Reddy', 'Mensah', 'Okafor', 'Garcia', 'Silva', 'Tanaka', 'Kim', 'Haddad', 'Cohen', 'Mwangi', 'Banda', 'Costa', 'Singh'];
const DEPTS = ['Finance', 'Health', 'Education', 'Revenue', 'Transport', 'Water', 'Planning', 'Legal', 'HR', 'IT'];
const DESIGS = ['Clerk', 'Officer', 'Senior Officer', 'Analyst', 'Manager', 'Inspector', 'Assistant'];
const ROW_SEED = 5150;

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n, w) {
  return String(n).padStart(w, '0');
}

// Clean row i (0-based data row). Depends only on i, so every file shares the same clean rows.
function cleanRow(i) {
  const r = mulberry32(ROW_SEED + i * 7919);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const first = pick(FIRST);
  const last = pick(LAST);
  const year = 2010 + Math.floor(r() * 15);
  const month = 1 + Math.floor(r() * 12);
  const day = 1 + Math.floor(r() * 28);
  return {
    employee_id: 'EMP-' + pad(i + 1, 5),
    first_name: first,
    last_name: last,
    email: (first + '.' + last + (i + 1)).toLowerCase() + '@agency.example',
    department: pick(DEPTS),
    designation: i % 97 === 0 ? '"Officer, Grade II"' : pick(DESIGS),
    date_of_joining: year + '-' + pad(month, 2) + '-' + pad(day, 2),
    phone: '9' + pad(Math.floor(r() * 1e9), 9)
  };
}

// kind: 'bad' (fails validation) or 'dup' (re-uses the employee_id of an earlier row)
function corrupt(row, i, kind) {
  const r = mulberry32(ROW_SEED * 3 + i * 104729);
  if (kind === 'dup') {
    row.employee_id = 'EMP-' + pad(Math.floor(r() * i) + 1, 5);
    return row;
  }
  const k = Math.floor(r() * 6);
  if (k === 0) row.email = '';
  else if (k === 1) row.email = row.email.replace('@', '');
  else if (k === 2) row.date_of_joining = '2021-02-30';
  else if (k === 3) row.department = '';
  else if (k === 4) row.phone = '12345';
  else row.date_of_joining = '2099-01-01';
  return row;
}

// About 4% bad rows and 1% duplicate rows. Row 0 is always clean.
function plan(n, seed) {
  const r = mulberry32(seed);
  const kinds = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const x = r();
    kinds[i] = x < 0.04 ? 'bad' : x < 0.05 ? 'dup' : null;
  }
  return kinds;
}

// Corrected file: the admin fixed about 85% of the earlier problems and a few new ones slipped in.
function planCorrected(previous, seed) {
  const r = mulberry32(seed);
  return previous.map((kind, i) => {
    const x = r();
    if (kind) return x < 0.15 ? kind : null;
    return i > 0 && x > 0.9983 ? 'bad' : null;
  });
}

function writeCsv(file, kinds) {
  const lines = [HEADER.join(',')];
  for (let i = 0; i < kinds.length; i++) {
    let row = cleanRow(i);
    if (kinds[i]) row = corrupt(row, i, kinds[i]);
    lines.push(HEADER.map((h) => row[h]).join(','));
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

function count(kinds, kind) {
  return kinds.filter((k) => k === kind).length;
}

function run(dir, log) {
  const out = log || console.log;
  fs.mkdirSync(dir, { recursive: true });
  const k1 = plan(12000, 11);
  const k2 = planCorrected(k1, 22);
  const k3 = plan(50000, 33);
  writeCsv(path.join(dir, FILES[0]), k1);
  writeCsv(path.join(dir, FILES[1]), k2);
  writeCsv(path.join(dir, FILES[2]), k3);
  [[FILES[0], k1], [FILES[1], k2], [FILES[2], k3]].forEach(([name, k]) => {
    out('generated ' + name + ': ' + k.length + ' rows, ' + count(k, 'bad') + ' invalid, ' + count(k, 'dup') + ' duplicate');
  });
}

function ensure(dir, log) {
  const missing = FILES.some((f) => !fs.existsSync(path.join(dir, f)));
  if (missing) run(dir, log);
}

module.exports = { run, ensure, FILES };

if (require.main === module) {
  run(process.argv[2] || path.join(__dirname, '..', 'data'));
}
