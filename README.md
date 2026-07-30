# ShedQuarters

Garage invoicing, quoting and job-card system for a UK workshop. Raise a quote, convert it to an
invoice, record the work carried out on the vehicle, and print or download an A4 document as the
customer's proof of work.

Runs entirely on Netlify: static React frontend, serverless functions for the API, and Netlify DB
(Postgres) for storage.

## Features

- **Invoices** — labour and parts lines, quantities, discounts, optional VAT, payment tracking and
  balances.
- **Quotes** — convert to an invoice or a job card in one click, carrying the customer, vehicle and
  every line item across.
- **Job cards** — a record of the work performed on a vehicle, with technician and signature lines.
- **Dashboard** — outstanding and overdue totals, invoiced value by month, open jobs, recent activity.
- **Vehicle history** — every past document for a registration, shown while you edit.
- **Printing** — A4 print stylesheet plus a Download PDF button.
- **CSV export** — for the accountant.

Customer and vehicle details are captured on each document and autocomplete from what you've entered
before, so there is no separate customer database to maintain.

## Running locally

```bash
npm install
npx netlify dev
```

`netlify dev` is required rather than `npm run dev` alone: it emulates the serverless functions and
provisions a development branch of the database. Set `APP_PASSWORD` and `SESSION_SECRET` in a local
`.env` (git-ignored) to sign in.

## Configuration

Two environment variables must be set on the Netlify project:

| Variable | Purpose |
| --- | --- |
| `APP_PASSWORD` | The workshop password used to sign in. |
| `SESSION_SECRET` | Random string used to sign session cookies. Changing it signs everyone out. |

The database needs no configuration — installing `@netlify/database` and deploying provisions it, and
migrations in `netlify/database/migrations/` are applied automatically before each deploy is
published.

Business details, logo, bank details, VAT registration and document number prefixes are all edited in
the app's Settings page.

## Layout

```
src/                          React app (pages, components, API client)
shared/                       Types, money/date formatting, totals — used by app and API
netlify/functions/            API endpoints at /api/*
netlify/functions/_lib/       Auth guard, database helpers, request parsing
netlify/database/migrations/  SQL migrations
```

Money is stored as integer pence throughout. Document totals are computed by a single
`calcTotals()` in `shared/totals.ts`, used by the editor, the printed sheet and the API, so the
figure on screen always matches the figure on the invoice.
