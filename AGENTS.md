# Accounting example

This repository is a single-company, sandbox-only application. Keep `shared/` usable in both the authenticated application and browser-only website demo. Never import the server, credentials or BankLink SDK into browser code.

Money is integer cents. Every posted journal must balance. Invoice/bill payments settle the existing receivable/payable; do not recognise revenue/expense twice. Keep imported bank lines and review metadata, deduplicated by account plus external ID. Do not infer input VAT from a bank description.

Run `npm test` and `npm run build`. Build the Docker image for changes to packaging. Never commit `secrets/`, `data/`, real bank data or private keys. The /v1 adapter accepts only BankLink test keys. Live banking, multi-tenancy, tax filing and payroll are outside the starter scope.

Synchronize shared UI changes using `node scripts/sync-website.mjs /path/to/aurvex`; the website remains an independent checkout and deployment.
