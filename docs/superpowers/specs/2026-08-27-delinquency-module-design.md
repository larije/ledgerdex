# Delinquency Module — Design Spec

**Date:** 2026-08-27
**Project:** LedgerDex (Property Tax PDF Intelligence & Ledger Management System — Province of Davao del Norte)
**Feature:** "Real Properties Whose Accounts Were Not Settled" — a module to import, track, and act on the *Consolidated Summary of All Delinquent Real Properties* (RA 7160 §254 notices).

---

## 1. Summary & Goals

Add a dedicated **Delinquencies** module that ingests a municipality's *Consolidated Summary of Delinquent Real Properties* PDF (sample: `KAPALONG.pdf`, 558 accounts, "as of July 5, 2026"), stores each delinquent account, tracks settlement over time, generates official notices/reports, and surfaces analytics.

The module is **self-contained** — it introduces its own data models and does **not** modify the existing `Property` / `Payment` tables. It reuses cross-cutting infrastructure: UI component library, `Role`-based auth, audit logging, `pdfjs-dist` parsing techniques, and the branded Excel/PDF export style.

### Confirmed decisions

| Decision | Choice |
|---|---|
| Placement | New standalone **Delinquencies** section (not merged into Properties) |
| Capabilities | Browse/search/filter · Settlement tracking · Notices & reports · Dashboard/analytics |
| Re-import model | **One living list per municipality** — match by TD number, carry settlement forward, mark dropped-off accounts `RESOLVED` |
| Settlement granularity | **Account-level** — payments reduce the single `TOTAL`; running balance |
| Import UX | **Preview → Confirm** (never auto-commit to a live list) |
| Notices | Grouped **per taxpayer** (one letter covers all of a taxpayer's delinquent properties); single + batch generation |

### Source document shape (from `KAPALONG.pdf`)

Columns: `NO. · TD NO. · PIN · BARANGAY · CLASS CODE (A/R/C/I) · RPU TYPE (land/bldg/mach/planttree) · AREA (SQM.) · TAXPAYER NAME · CADASTRAL LOT NO. · START YEAR-QTR · END YEAR-QTR · TOTAL`.
Header block: `Province of Davao del Norte`, `MUNICIPALITY OF <NAME>`, `as of <date>`, RA 7160 §254 preamble. Footer: `Page X of N`, `Certified Correct: (SGD) <Municipal Treasurer>`.

Key differences from the existing RPTOP extractor: per-row taxpayer, delinquency period, total amount owed, no market/assessed values, `planttree` RPU type, single-letter class codes.

---

## 2. Data Model (Prisma / MySQL)

New models added to `prisma/schema.prisma`. Generated client output stays at `../src/generated/prisma`.

### Enums

```prisma
enum RpuType {
  LAND
  BLDG
  MACH
  PLANTTREE
  MISC
}

enum SettlementStatus {
  OUTSTANDING   // on the list, nothing paid
  PARTIAL       // some paid, balance remains
  SETTLED       // fully paid or manually marked settled
  RESOLVED      // dropped off a newer list (assumed paid/removed)
}
```

### `DelinquencyList` — the living list, one per municipality

```prisma
model DelinquencyList {
  id             String   @id @default(cuid())
  province       String   @default("Davao del Norte")
  municipality   String
  asOfDate       DateTime?
  title          String?  @db.Text
  lastImportedAt DateTime?
  accountCount   Int      @default(0)
  totalAmountDue Decimal  @default(0) @db.Decimal(18, 2)
  totalSettled   Decimal  @default(0) @db.Decimal(18, 2)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  accounts DelinquentAccount[]
  imports  DelinquencyImport[]

  @@unique([province, municipality])
  @@map("delinquency_lists")
}
```

### `DelinquentAccount` — one per PDF row (core record)

```prisma
model DelinquentAccount {
  id                  String           @id @default(cuid())
  listId              String
  list                DelinquencyList  @relation(fields: [listId], references: [id], onDelete: Cascade)

  rowNo               Int?             // NO. column from latest import (informational)
  tdNumber            String
  pin                 String?
  barangay            String?
  classCode           String?          // A / R / C / I (raw); label mapped in UI
  rpuType             RpuType          @default(MISC)
  areaSqm             Decimal?         @db.Decimal(14, 2)
  taxpayerName        String           @db.Text
  cadastralLotNo      String?

  delinquentFromYear    Int?
  delinquentFromQuarter Int?
  delinquentToYear      Int?
  delinquentToQuarter   Int?

  amountDue           Decimal          @db.Decimal(15, 2)   // TOTAL from the list
  amountPaid          Decimal          @default(0) @db.Decimal(15, 2)
  balance             Decimal          @db.Decimal(15, 2)   // amountDue - amountPaid, kept updated
  status              SettlementStatus @default(OUTSTANDING)
  settledAt           DateTime?
  reappearedAfterSettle Boolean        @default(false)      // flagged when a SETTLED acct returns on a newer list

  firstSeenAt         DateTime         @default(now())
  lastSeenAt          DateTime         @default(now())
  isPresent           Boolean          @default(true)       // still on the latest imported list

  notes               String?          @db.Text
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt

  settlements SettlementPayment[]

  @@unique([listId, tdNumber])
  @@index([listId])
  @@index([tdNumber])
  @@index([taxpayerName(length: 100)])
  @@index([status])
  @@index([barangay])
  @@map("delinquent_accounts")
}
```

### `SettlementPayment` — settlement ledger (child of account)

```prisma
model SettlementPayment {
  id           String            @id @default(cuid())
  accountId    String
  account      DelinquentAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  amount       Decimal           @db.Decimal(15, 2)
  orNumber     String?           // Official Receipt no.
  paymentDate  DateTime?
  collector    String?
  notes        String?           @db.Text
  recordedById String?
  recordedBy   User?             @relation(fields: [recordedById], references: [id])
  createdAt    DateTime          @default(now())

  @@index([accountId])
  @@map("settlement_payments")
}
```

### `DelinquencyImport` — one row per upload (history/audit)

```prisma
model DelinquencyImport {
  id             String          @id @default(cuid())
  listId         String
  list           DelinquencyList @relation(fields: [listId], references: [id], onDelete: Cascade)
  fileName       String          // original filename
  storedName     String          @unique   // saved under ./uploads/
  fileSize       Int
  asOfDate       DateTime?
  rowsParsed     Int             @default(0)
  rowsAdded      Int             @default(0)
  rowsUpdated    Int             @default(0)
  rowsResolved   Int             @default(0)
  rowsReappeared Int             @default(0)
  rowErrors      Int             @default(0)
  totalAmountDue Decimal         @default(0) @db.Decimal(18, 2)
  importedById   String?
  importedBy     User?           @relation(fields: [importedById], references: [id])
  createdAt      DateTime        @default(now())

  @@index([listId])
  @@map("delinquency_imports")
}
```

### Relations added to existing `User`

```prisma
// in model User:
settlementPayments  SettlementPayment[]
delinquencyImports  DelinquencyImport[]
```

> No change to `Property`, `Payment`, `Document`, `Remark`, `Attachment`, or `AuditLog` models. `AuditLog` already has nullable `propertyId`/`documentId`; delinquency actions log with neither set and a descriptive `action`/`details` (e.g. `action: "DELINQUENCY_IMPORT"`).

---

## 3. Import & Parse Flow

### 3.1 Parser — `src/lib/delinquency-extractor.ts`

New module (the existing `pdf-extractor.ts` targets a different layout and is left untouched). Reuses its proven approach:

1. Dynamic `import("pdfjs-dist/legacy/build/pdf.mjs")` (SSR-safe).
2. Per page: map text items to `{str, x, y, width, height}` (y flipped to top-origin).
3. `groupIntoRows()` by Y-tolerance; sort top-to-bottom.
4. Build an X-coordinate **column map** from the header row (keywords: `TD NO.`, `PIN`, `BARANGAY`, `CLASS`, `RPU`/`TYPE`, `AREA`/`SQM`, `TAXPAYER`, `CADASTRAL`/`LOT`, `START`, `END`, `TOTAL`).
5. Read cells per data row by X-band.

**Header metadata** (any page — headers repeat): `province` from `Province of <…>`, `municipality` from `MUNICIPALITY OF <NAME>`, `asOfDate` from `as of <date>` (parse to `DateTime`; tolerate failure → null).

**Row detection:** a data row is anchored by a TD number matching `20\d{2}-\d{2}-\d{4}-...`. Repeated page headers, the title block, `Page X of N`, and the `Certified Correct` footer are skipped.

**Row quirks handled (observed in `KAPALONG.pdf`):**
- **Multi-line taxpayer names** — long names / semicolon co-owner lists wrap to a second visual line (e.g. rows 63, 116, 271, 279, 303–310, 375–386). Stitch continuation lines into the owning row using the row-number/TD anchor + Y-band adjacency, before cell extraction.
- **Period cells** — `2018-Q1` → `{year: 2018, quarter: 1}`; blank/malformed → nulls.
- **Amount** — `112,533.16` → strip commas → `Decimal` (reuse `parseNumeric`).
- **RPU type** — map `land/bldg/mach/planttree` → enum; unknown → `MISC`.
- **Class code** — keep raw single letter (A/R/C/I); UI maps to Agricultural/Residential/Commercial/Industrial.
- **Area** — integer sqm; `mach`/`planttree` rows often `0`.

**Output:** `{ province, municipality, asOfDate, title, rows: ParsedDelinquentRow[], rowErrors: {rowNo?, raw, reason}[] }`.

**Rejection:** if zero TD-anchored rows are found, throw a typed error → API returns 422 with "This does not look like a Delinquent Real Properties summary." No list is created.

### 3.2 Upload UX (preview → confirm)

Mirrors the existing document-upload flow:

1. `/delinquencies/import` — drag-drop a PDF. File saved to `./uploads/` (unique stored name), same as existing uploads.
2. `POST /api/delinquencies/import/preview` — parses only (no writes). Returns parsed rows + **reconciliation preview** against the existing list for that municipality: counts of `added / updated / resolved / reappeared / rowErrors`, detected municipality + as-of date, and any row-parse errors.
3. Preview screen renders the parsed table + the summary. If the file's municipality already has a list, show a "this will update the KAPALONG living list" banner.
4. **Confirm Import** → `POST /api/delinquencies/import/commit` runs reconciliation in a transaction.

### 3.3 Reconciliation (pure, then persisted)

A pure function `reconcile(existingAccounts, parsedRows): ReconcilePlan` (unit-testable without a DB), then applied in one Prisma `$transaction`:

1. Find/create `DelinquencyList` for `(province, municipality)`.
2. For each parsed row keyed by `tdNumber`:
   - **exists** → update `rowNo, pin, barangay, classCode, rpuType, areaSqm, taxpayerName, cadastralLotNo, period*, amountDue`; recompute `balance = amountDue - amountPaid`; set `lastSeenAt = now`, `isPresent = true`. **Preserve `status`, `amountPaid`, `settledAt`, settlements.** If existing `status = SETTLED`, set `reappearedAfterSettle = true` (kept settled).
   - **new** → create with `status = OUTSTANDING`, `amountPaid = 0`, `balance = amountDue`, `firstSeenAt = lastSeenAt = now`, `isPresent = true`.
3. Accounts previously `isPresent = true` but absent from this file → `isPresent = false`; if `status ∈ {OUTSTANDING, PARTIAL}` → `status = RESOLVED`, `settledAt = now`. (`SETTLED` stays `SETTLED`.)
4. Recompute list roll-ups (`accountCount`, `totalAmountDue`, `totalSettled`), set `asOfDate`, `lastImportedAt`.
5. Write `DelinquencyImport` + `AuditLog`.

Duplicate TD within a single file: last occurrence wins; counted once.

---

## 4. Settlement Tracking

On `/delinquencies/accounts/[id]`:

- Record a settlement payment: `amount, orNumber, paymentDate, collector, notes`.
- On create/edit/delete of a payment: `amountPaid = Σ payments`, `balance = amountDue - amountPaid`, and `status` auto-derived: `0 paid → OUTSTANDING`, `0 < paid < due → PARTIAL`, `paid ≥ due → SETTLED` (`settledAt` set). Roll up to `DelinquencyList.totalSettled`.
- **Manual "Mark Settled"** (compromise/condoned) — sets `SETTLED` with a required note even if `balance > 0`.
- Editing/deleting payments restricted to ADMIN/ASSESSOR; recomputes roll-ups. Every mutation writes an `AuditLog`.

---

## 5. Notices & Reports — `src/lib/delinquency-export.ts`

Modeled on the existing `export.ts` (same banner, footer, Davao del Norte seal, "FOR OFFICIAL USE ONLY", `en-PH` formatting).

- **Consolidated Summary (Excel + PDF)** — regenerates the official list grouped by municipality → barangay, columns matching the source (`No., TD No., PIN, Barangay, Class, RPU Type, Area, Taxpayer, Cadastral Lot, Delinquent From, Delinquent To, Amount Due`) plus a bold **TOTAL** footer. Honors the active filters. Server-side styled Excel served from `GET /api/delinquencies/export` (mirrors `/api/export/excel`); client jsPDF for PDF.
- **Per-taxpayer Notice (RA 7160 §254)** — printable PDF letter grouping **all** of a taxpayer's delinquent accounts (e.g. `ALIMES, LORETO P.` → 3 parcels; `DELTA FARMS INC.` → many) with per-parcel lines and a combined total. `GET /api/delinquencies/accounts/[id]/notice` (that account's taxpayer) and `GET /api/delinquencies/notice?taxpayer=<name>&listId=<id>` (batch: one letter per taxpayer across a filtered set, concatenated into a single PDF).
- **Filtered CSV/Excel** of any account view.

---

## 6. Dashboard & Analytics — `GET /api/delinquencies/stats`

A **Delinquencies overview** page plus a compact card on the main Dashboard. Reuses Recharts + animated-counter patterns.

- KPI cards: total outstanding balance, # delinquent accounts (`isPresent && status ≠ SETTLED`), # settled, total collected (Σ settlements).
- Breakdowns: by municipality, by barangay, by class (A/R/C/I), by RPU type.
- **Top delinquents** (largest `balance`) and **oldest delinquencies** (earliest `delinquentFromYear`).

---

## 7. UI, Routes & API

### Navigation
New sidebar section **"Delinquencies"** (icon `FileWarning`) after "PDF Processing" in `src/components/layout/Sidebar.tsx`:
- Delinquency Overview → `/delinquencies`
- Import List → `/delinquencies/import`
- Delinquent Accounts → `/delinquencies/accounts`

### Pages — `src/app/(app)/delinquencies/`
| Route | Purpose |
|---|---|
| `/delinquencies` | Overview dashboard + list of municipal lists (counts, totals, as-of date) |
| `/delinquencies/import` | Upload → preview → confirm |
| `/delinquencies/accounts` | Master account table: search (taxpayer/TD), filters (municipality, barangay, class, RPU type, status, amount range, start-year), pagination, export buttons |
| `/delinquencies/accounts/[id]` | Account detail — record, settlement ledger, record-payment, generate notice, notes |
| `/delinquencies/[listId]` | One municipality's list + import history |

### API — `src/app/api/delinquencies/`
| Method + path | Purpose |
|---|---|
| `POST /import/preview` | Parse only; return rows + reconciliation preview |
| `POST /import/commit` | Reconcile + persist (transaction) |
| `GET /lists` · `GET /lists/[id]` | Municipal lists + detail/history |
| `GET /accounts` | Filtered, paginated accounts |
| `GET/PATCH/DELETE /accounts/[id]` | Account detail / edit notes-status / delete |
| `POST /accounts/[id]/settlements` | Record settlement |
| `PATCH/DELETE /accounts/[id]/settlements/[sid]` | Edit/void settlement |
| `GET /accounts/[id]/notice` · `GET /notice` | Per-taxpayer / batch notice PDF |
| `GET /export` | Styled Excel of a filtered view |
| `GET /stats` | Dashboard data |

### Types
Extend `src/types/` with `DelinquentAccount`, `DelinquencyList`, `SettlementPayment`, `ParsedDelinquentRow`, `ReconcilePlan`, and label maps for `classCode` / `RpuType`.

### Permissions (reuse `Role`)
- **ADMIN / ASSESSOR / ENCODER**: import, record settlements, generate notices.
- **VIEWER**: read-only (browse, export, print).
- **Edit/delete settlement, delete account/list**: ADMIN / ASSESSOR only.
- Every mutation → `AuditLog`.

---

## 8. Error Handling & Testing

- **Parser unit tests** against `KAPALONG.pdf` fixture: total row count (558), multi-line taxpayer stitching (spot-check rows 63, 271, 279, 303–310, 375–386), amount & period parsing, `planttree` mapping, header municipality/as-of extraction.
- **Reconciliation unit tests** on the pure `reconcile()` function: add / update-preserving-settlement / resolve-on-drop / settled-reappeared flag.
- **Wrong-format rejection** returns 422; no list mutated.
- **Transactional commit** — all-or-nothing.
- Keep `KAPALONG.pdf` as a committed test fixture.

---

## 9. Out of Scope (YAGNI)

- Penalty/interest recomputation — the `TOTAL` from the list is taken as authoritative as of its date.
- Auction/levy workflow beyond notice generation.
- Linking delinquency accounts to existing `Property` records (kept separate per the chosen approach; can be a future enhancement).
- Per-year/per-quarter settlement breakdown (account-level only).

---

## 10. Implementation Order (for the plan)

1. Prisma models + migration + regenerate client.
2. `delinquency-extractor.ts` + parser unit tests (fixture).
3. `reconcile()` pure function + tests.
4. Import API (`preview`, `commit`) + upload/preview UI.
5. Accounts list + detail pages + accounts API.
6. Settlement API + UI + roll-up recompute.
7. `delinquency-export.ts` (summary + notices) + export/notice API.
8. Stats API + overview dashboard + main-dashboard card.
9. Sidebar nav + types + permission gating + audit wiring.
