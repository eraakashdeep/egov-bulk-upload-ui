# Sample data

This folder holds the sample files for the bulk upload exercise. They are written here automatically the first time the mock API starts (docker compose up --build in ../mock-api), or by running `node ../mock-api/generate.js`. Use them as-is; do not edit them.

**upload-1.csv**: 12,000 data rows, about 600 of them bad (roughly 480 rejected and 120 duplicate employee ids).

**upload-2-corrected.csv**: the same file after the admin fixed most problems in place, with a handful of problems left and a few new ones.

**stress-50000.csv**: 50,000 data rows with about 2,500 bad ones, for testing the table and filtering with a large list.

Columns: employee_id, first_name, last_name, email, department, designation, date_of_joining, phone. The first line is the header.
