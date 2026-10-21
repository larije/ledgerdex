# LedgerDex to eTRACS Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add an on-demand button that refreshes the selected LedgerDex delinquent-account record from eTRACS and presents eTRACS as the official current tax state.

**Architecture:** A server-only Prisma client, configured with a separate eTRACS MySQL URL, queries eTRACS by the selected account's exact TD. A protected LedgerDex route validates and stores the property refresh and one-to-one financial snapshot in one LedgerDex transaction. The account page shows the eTRACS snapshot as official and retains LedgerDex imported totals and manual settlement entries as labeled local history.

**Tech Stack:** Next.js 16.2 App Router, React 19, Prisma 5.22/MySQL for LedgerDex and the separate raw-SELECT eTRACS connection.

**Spec:** `docs/superpowers/specs/2026-10-09-etracs-ledgerdex-sync.md`

## Global Constraints

- The eTRACS connection is strictly read-only. Sync must never run writes, DDL, stored procedures, or other mutations against eTRACS.
- Find exactly one eTRACS ledger by exact `rptledger.tdno`.
- Amount due is the sum of `rptledger_item.amount` where `rptledger_item.parentid = rptledger.objid` for the matched TD.
- Amount paid is the sum of non-voided `rptpayment_item.amount` rows whose `rptledgerfaasid`, `year`, and `revtype` match an assessment row for the matched ledger, joined by `parentid` to `rptpayment`.
- Receipt history is scoped through the matched ledger's `rptledgerfaas` rows, so receipts remain visible even when no current assessment rows exist.
- Balance is `max(amount due - amount paid, 0)`; status is derived from those principal totals and stored in the eTRACS snapshot.
- Credentials stay server-side; use parameterized SQL and a database identity with SELECT-only grants.
- A failed or ambiguous lookup must not partially update the LedgerDex record.
- eTRACS is authoritative for the current tax state; LedgerDex totals and settlement entries remain local history/reference and do not override eTRACS.
- Do not add or run tests under the current session instruction; this plan contains no test files or test commands.

## Review Focus

- A TD with no eTRACS row or multiple exact matches must return a clear error and leave LedgerDex unchanged.
- Voided receipts and payment details that do not match the matched ledger's assessment rows must not contribute to the account's paid principal.
- Receipt history must still show non-assessment-row receipts whose FAAS belongs to the matched ledger.
- Unresolved barangay/classification labels must preserve the current LedgerDex value instead of writing an opaque eTRACS ID.
- Missing connection configuration, timeout, or invalid monetary data must fail without changing the snapshot or property fields.
- Repeated clicks update the existing account's single latest snapshot and never create a duplicate account.
- Recording, editing, or voiding a LedgerDex-local settlement, or changing the local status, must not change the official eTRACS summary.

## File Map

- `src/lib/etracs-sync.ts` — server-only eTRACS pool, parameterized SELECT queries, row validation, and typed eTRACS snapshot mapping.
- `.env.example` — add the server-only connection setting placeholder.
- `prisma/schema.prisma` — one-to-one latest snapshot model related to `DelinquentAccount`.
- `src/types/index.ts` — client/API type for the eTRACS snapshot.
- `src/app/api/delinquencies/accounts/[id]/etracs-sync/route.ts` — authenticated POST, account-scoped lookup, atomic LedgerDex update, and audit entry.
- `src/app/api/delinquencies/accounts/[id]/route.ts` — include the latest snapshot in the account detail response.
- `src/app/(app)/delinquencies/accounts/[id]/page.tsx` — button, primary eTRACS summary/status, sync feedback, and labeled LedgerDex local history.
- `docs/etracs-sync-setup.md` — read-only eTRACS account and LedgerDex environment/schema setup instructions; no credentials.

---

### Task 1: Add the read-only eTRACS data adapter

**Files:**
- Create: `src/lib/etracs-sync.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`

**Interfaces:**
- Produces `EtracsAccountData` with `faasId`, optional resolved `pin`, `classCode`, `rpuType`, `taxpayerName`, and `cadastralLotNo`, decimal-string `amountDue`, decimal-string `amountPaid`, decimal-string `balance`, `status`, nullable `lastPaidYear`, and nullable `lastPaidQuarter`. Unresolved area/barangay sources are omitted so LedgerDex keeps its current values.
- Exports `fetchEtracsAccountData(tdNumber: string): Promise<EtracsAccountData>` for the route task.

- [x] Add an `ETRACS_DATABASE_URL` placeholder in `.env.example`; never add real connection values or a `NEXT_PUBLIC_` setting. Reuse the installed Prisma 5.22 MySQL engine via its per-client `datasourceUrl` override rather than adding another database driver.
- [x] Implement a server-only connection pool with a bounded pool size, finite connection/query timeouts, and multiple statements disabled.
- [x] Implement parameterized `SELECT` queries: fetch exact `rptledger` matches by `tdno`; reject zero or multiple matches; sum due by `rptledger_item.parentid = rptledger.objid`; sum paid by matching `rptledger.faasid` through non-voided `rptpayment` records; derive balance/status and last-paid period.
- [x] Map only source columns and lookup labels confirmed by the supplied eTRACS schema. If a property label cannot be resolved, return no replacement for that field so the existing LedgerDex value is retained. Area and barangay lookups are unresolved from the supplied schema and will be preserved.
- [x] Validate numeric values and derive balances in integer cents before returning decimal strings; do not use binary floating-point arithmetic in the adapter.

### Task 2: Persist the latest eTRACS snapshot

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/types/index.ts`

**Interfaces:**
- Adds optional `etracsSnapshot: EtracsSyncSnapshot | null` to the delinquent-account detail response type.
- `EtracsSyncSnapshot` stores one current row per account: `accountId`, `faasId`, `amountDue`, `amountPaid`, `balance`, `status` (`OUTSTANDING | PARTIAL | SETTLED`), `lastPaidYear`, `lastPaidQuarter`, and `syncedAt`.

- [x] Add an `EtracsStatus` enum (`OUTSTANDING`, `PARTIAL`, `SETTLED`) and a one-to-one `EtracsSyncSnapshot` Prisma model with a unique `accountId`, cascade deletion with its account, DECIMAL(15,2) principal fields, and a mapped table name `etracs_sync_snapshots`.
- [x] Add the optional relation to `DelinquentAccount` and add the corresponding client type.
- [x] Expose the snapshot through the detail API response type. Use parameterized Prisma raw queries for snapshot reads/upserts until the repository client can be regenerated; do not manually edit generated files.
- [x] Document that LedgerDex deployment must apply the additive Prisma schema change before the feature is used; do not run `db:push` against a live database during this task.

### Task 3: Add the protected account sync route

**Files:**
- Create: `src/app/api/delinquencies/accounts/[id]/etracs-sync/route.ts`
- Modify: `src/app/api/delinquencies/accounts/[id]/route.ts`
- Consume: `src/lib/etracs-sync.ts` and the Prisma snapshot relation from Tasks 1–2.

**Interfaces:**
- `POST /api/delinquencies/accounts/[id]/etracs-sync` accepts no TD from the browser; it loads the account by route ID and passes the stored `tdNumber` to `fetchEtracsAccountData`.
- Successful response returns the updated account and its latest `etracsSnapshot`.

- [x] Require `canWrite` using the existing `getRequestUser` pattern; return 404 for a missing LedgerDex account.
- [x] Fetch and validate the complete eTRACS result before beginning LedgerDex writes.
- [x] In a Prisma transaction, update only resolved property detail values on the existing account, upsert its one-to-one eTRACS snapshot with parameterized SQL, and create a `DELINQUENCY_ETRACS_SYNC` audit event.
- [x] Do not alter local amount fields, local settlement rows, or eTRACS. Do not expose SQL errors, database details, or raw eTRACS rows in API errors.
- [x] Use distinct error responses for unavailable configuration/connection, no exact match, ambiguous match, and invalid source data while preserving all prior LedgerDex values on failure.
- [x] Extend the existing account GET response with the latest eTRACS snapshot.

### Task 4: Add the sync action and official eTRACS display

**Files:**
- Modify: `src/app/(app)/delinquencies/accounts/[id]/page.tsx`
- Consume: the sync route and `etracsSnapshot` detail response from Task 3.

- [x] Add **Sync eTRACS** beside **Delete Account** at the screenshot-marked bottom-right location, with disabled/loading state while the request is running.
- [x] On success, refresh the existing detail data and show a success message; on failure, show the safe route error and retain the previous displayed values.
- [x] Display eTRACS due, paid, balance, derived status, last-paid period, and last sync time as the authoritative current state.
- [x] Label the existing LedgerDex imported summary, status controls, and settlement table as LedgerDex local history/reference; keep them visible without combining them with eTRACS totals or changing the official eTRACS status.
- [x] Show “Not synced” when no successful eTRACS snapshot exists; keep current local property values visible until a successful sync resolves replacements.

### Task 5: Document deployment and read-only configuration

**Files:**
- Create: `docs/etracs-sync-setup.md`
- Modify: `.env.example` (if Task 1 has not already added the placeholder)

- [x] Explain how to create a dedicated eTRACS database user with SELECT grants limited to required tables; provide example SQL with placeholder database/user values only and do not execute it.
- [x] Explain how to set `ETRACS_DATABASE_URL` in the server environment and keep it out of browser bundles and source control.
- [x] Document the additive LedgerDex schema deployment step and that eTRACS itself receives no schema/data changes.
- [x] Document expected no-match, ambiguous-match, offline, and not-yet-configured messages for operators.

---

## Self-review

- Spec coverage: UI placement and selected-TD behavior are Task 4; official versus local figures and derived amounts are Tasks 1, 3, and 4; persistence and atomic failure handling are Tasks 2–3; read-only credentials and safe SQL are Tasks 1 and 5; audit logging is Task 3; no duplicate account is covered by the route and snapshot upsert in Tasks 2–3.
- Type consistency: Task 1 produces `EtracsAccountData`; Task 2 persists `EtracsSyncSnapshot`; Task 3 consumes both and returns the account detail shape; Task 4 renders the same response type.
- Review focus is captured in code paths and route behavior; automated test authoring/execution is intentionally excluded by the current session instruction.
- Existing repository modifications are pre-existing and must remain untouched unless a listed file is required for this feature.

