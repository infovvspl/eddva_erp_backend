# Authentication environment variables

Names only. Never commit values. None of these has a default: a missing value
makes the service refuse to start (core secrets) or refuse the operation
(module secrets), rather than falling back to a known string.

## Core (always required at startup)

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | Signs and verifies ERP login tokens (`/auth/login`). |
| `SCHOOL_JWT_SECRET` | Verifies LMS-issued SSO tokens. Must equal the LMS value. Set it explicitly on both sides; the derived `school:<JWT_SECRET>` value is no longer accepted. |

## Per-module platform secrets

Each module signs its own JWT after SSO exchange. Each must be set, must
differ from `JWT_SECRET` and `SCHOOL_JWT_SECRET`, and should differ from the
other modules'. Outside `NODE_ENV=production` a missing one is a startup
warning and the module's login/verify fails; in production it stops startup.

`ACCOUNTS_JWT_SECRET`, `ADMISSION_JWT_SECRET`, `ALUMNI_JWT_SECRET`,
`CANTEEN_JWT_SECRET`, `FRONT_OFFICE_JWT_SECRET`, `HOSTEL_JWT_SECRET`,
`INVENTORY_JWT_SECRET`, `LIBRARY_JWT_SECRET`, `SALES_PURCHASE_JWT_SECRET`,
`SPORTS_JWT_SECRET`, `TRANSPORT_JWT_SECRET`

## Data-encryption keys

| Variable | Purpose |
| --- | --- |
| `FRONT_OFFICE_ID_PROOF_KEY` | Encrypts visitor ID proofs at rest (required when storing one). |
| `HOSTEL_ID_PROOF_KEY` | Same, for Hostel. |

Rows written before this change were encrypted with a key derived from
`JWT_SECRET` (or a built-in default). To keep them readable, set
`FRONT_OFFICE_ID_PROOF_KEY` to that same old value, or re-encrypt them with a
reviewed script before rotating.
