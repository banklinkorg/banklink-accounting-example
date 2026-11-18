# Ledgerline — BankLink accounting example

A runnable, single-company accounting application for a fictional South African coffee business. React frontend, Express backend and SQLite persistence, served by one container. The website preview uses the same UI and model with browser-local data.

## Start with Docker

Requirements: Docker with Compose; Node 22.13+ only if you use the setup script directly. Docker itself uses Node 24.

```sh
git clone https://github.com/aurvex-labs/banklink-accounting-example.git
cd banklink-accounting-example
node scripts/setup.mjs
docker compose up --build
```

Alternatively generate the password without installing Node on the host:

```sh
docker run --rm -v "$PWD:/app" -w /app node:24-alpine node scripts/setup.mjs
```

Open **http://localhost:3108**. Read `secrets/app-password` locally to sign in. The setup script creates a random password and never replaces an existing one. The secret directory is owner-only; the password file is readable inside the non-root container via a read-only Compose secret mount. Never commit this directory.

The application is available only on the workstation loopback interface. SQLite records persist in the `accounting_data` named volume. `docker compose down` stops this example without deleting that volume; deleting volumes deletes the example's records.

## What works

- Overview with ledger balances and income/expense totals.
- Bank transaction review, categorisation and suggested invoice/bill matches.
- Full and partial invoice/bill settlement, with overpayment and duplicate-posting checks.
- Create invoices and supplier bills; view customer/supplier outstanding balances.
- Profit and loss, balance sheet, trial balance, general ledger and unpaid invoice reports.
- CSV report and document VAT working-paper downloads.
- Application sign-in, server-side sessions and activity history.
- BankLink **test-key** sandbox ingestion with account-scoped transaction deduplication.

All amounts are integer cents. Documents are accrual-basis entries: invoices debit Receivables and credit Sales/VAT; payments debit Bank and credit Receivables. Bills and their settlement use Payables. Matching a payment does not count income or expense twice. Direct bank categories do not infer deductible VAT.

The fictional dataset is dated November 2026, not a live view of today's activity. “Recorded bank balance” includes the sample opening balance plus posted transactions. Imported transactions awaiting review do not change the ledger until recorded. Bank-line review is not a complete statement-closing reconciliation.

## Optional: BankLink test-key sandbox

The app runs immediately without API access. The included sample dataset is **not** a remote sandbox connection.

To exercise BankLink, obtain a `sk_test_` key using your BankLink account. Required capabilities: `link`, `accounts:read`, `accounts:sync`, `transactions:read` (see your key's actual permission configuration). Place the key into `secrets/banklink-api-key` using a local editor; make the file readable to the container within the private `secrets` directory. Do not put it in a frontend variable.

```sh
docker compose -f compose.yaml -f compose.sandbox.yaml up --build
```

Sign in and select **Banking → Update bank feed**. The adapter uses `@banklink/sdk` to list accounts, create a synthetic FNB account if the sandbox has none, sync accounts and import paginated transactions. Only synthetic sandbox credentials are sent during account creation. Existing sandbox accounts remain intact. Repeated imports preserve review decisions and skip account/external-ID duplicates.

This is explicitly the **/v1 test-key sandbox** integration. SDK v2 uses customer-held keys and does not accept test keys; v2/live-bank onboarding is not implemented here. This example refuses all non-test API keys and does not collect real bank credentials. BankLink's real sandbox requires your own key and permissions. No real account was used to develop this repository.

## Local development

```sh
npm ci
npm run setup
npm run build
npm start
```

For Vite hot reload, run the server in one terminal with `APP_ORIGIN=http://localhost:5173 npm run server`, then `npm run dev` in another. Open http://localhost:5173. The dev proxy forwards `/api` to port 3108. Only the declared origin is accepted for state changes.

```sh
npm test
npm run build
```

Tests cover posting, matching, partial settlement, balanced journals, duplicate imports, persistence and authentication boundaries. The server test uses injected synthetic BankLink responses; it does not claim to verify the hosted sandbox.

## Configuration and security

| Variable | Default / purpose |
| --- | --- |
| `APP_PASSWORD_FILE` | `./secrets/app-password`; at least 16 characters |
| `BANKLINK_API_KEY_FILE` | Unset; optional test-key file |
| `APP_ORIGIN` | `http://localhost:3108`; exact public browser origin |
| `DATA_DIR` | `./data`; SQLite and journal files |
| `HOST` / `PORT` | `127.0.0.1` / `3108` outside Docker |

The app uses scrypt password comparison, random session tokens stored hashed in SQLite, eight-hour HttpOnly/SameSite=Strict cookies, explicit Origin checks, schema validation, security headers and login/import rate limits. HTTPS origins enable Secure cookies. Production mode refuses a non-HTTPS public origin. No CORS access is enabled. API responses are not cached. Keys and bank credentials never go into the browser or logs.

The container runs as a non-root user with a read-only filesystem, a writable data volume, dropped capabilities and no privilege escalation. Put a publicly hosted fork behind TLS, set `APP_ORIGIN`, back up its data and manage credentials through your own secret manager. This starter has one company and one shared application password: add per-user identity, roles, tenant isolation, recovery and appropriate operational controls before handling customer data. It is not a complete production accounting package.

## Tax and accounting boundaries

VAT201 is an illustrative document VAT summary and CSV working paper. IRP6 is an explanatory preparation view, not a provisional tax calculator. No returns are submitted to SARS. Payroll/EMP201/EMP501, ITR14 calculations, supporting-document storage, credit notes, inventory, currency conversion, period locking and full statement reconciliation are not implemented. Tax rates are sample data, not a maintained tax engine. Obtain professional review before extending for tax filing.

## Website preview reuse

`shared/AccountingApp.tsx`, `shared/model.ts` and `shared/accounting.css` are the common source. Run:

```sh
node scripts/sync-website.mjs /absolute/path/to/aurvex
```

This copies only those files to the BankLink website's accounting demo directory. The website wrapper supplies ephemeral state instead of authenticated API calls. It contains no secret or server import. Commit the synchronized copy with website changes; both projects build independently.

MIT licensed. BankLink names do not grant rights to impersonate the service.
