# LedgerDex to eTRACS read-only sync

## Goal

Add an on-demand **Sync eTRACS** action to the selected delinquent-account detail page. It looks up that account's TD number in eTRACS, refreshes the account's property details in LedgerDex, and saves the authoritative eTRACS financial snapshot.

The eTRACS connection is strictly read-only. Sync must never run writes, DDL, stored procedures, or other mutations against eTRACS.

## User-visible behavior

- Place **Sync eTRACS** beside **Delete Account** at the bottom of the detail page, matching the location marked in the supplied screenshot.
- Clicking it fetches the latest eTRACS data for the current account's exact TD number and updates that same LedgerDex account record; it must not create a duplicate account. Show a loading state and a clear success or failure message.
- On success, refresh the existing property detail fields from eTRACS and show the eTRACS amount due, amount paid, balance, status, last-paid year/quarter when present, and last successful sync time as the authoritative current state.
- Keep LedgerDex-imported figures and locally recorded settlement entries available as clearly labeled LedgerDex history/reference. They must not override, add to, or subtract from the official eTRACS balance or status. Do not import eTRACS receipt rows as LedgerDex settlements.
- If the TD has no eTRACS match, has an ambiguous match, or the lookup fails, show the reason and leave the last successful snapshot and current account values intact.

## Data lookup and financial definitions

- Find exactly one eTRACS ledger by exact `rptledger.tdno`. Sum assessed principal from `rptledger_item` rows where `parentid = rptledger.objid`. Scope paid principal and the projection to those same assessment rows by matching `rptledgerfaasid`, `year`, and `revtype`.
- For displayed receipt history, scope `rptpayment_item` through `rptledgerfaas` rows where `rptledgerfaas.rptledgerid = rptledger.objid` and `rptledgerfaas.objid = rptpayment_item.rptledgerfaasid`. This preserves older receipts when a selected ledger has no current `rptledger_item` rows without changing the principal totals.
- Read the existing account's displayed property fields from the matched `rptledger` row and its eTRACS reference rows for display labels such as barangay/classification where needed. Only write a property value into LedgerDex when the source value is resolved and valid; do not replace a known label with an opaque database ID.
- The proposed eTRACS financial totals represent tax principal, so they remain comparable and stable:
  - **Amount due:** sum `rptledger_item.amount` where `rptledger_item.parentid = rptledger.objid` for the matched TD.
  - **Amount paid:** sum non-voided `rptpayment_item.amount` rows whose `rptledgerfaasid`, `year`, and `revtype` match an assessment row for the matched ledger, joined by `parentid` to `rptpayment`.
  - **Balance:** `max(amount due - amount paid, 0)`.
  - **Official eTRACS status:** `SETTLED` when balance is zero and a ledger exists; `PARTIAL` when paid principal is positive and balance remains; `OUTSTANDING` when balance remains with no principal paid. A missing or ambiguous ledger is a sync error, not a zero-balance status.
- Interest, discount, amnesty, and `rptpayment.amount` are not folded into these three principal totals. They can make the receipt's cash total differ from the per-account tax allocation. The supplied data demonstrates this: a valid receipt for TD `2023-04-0002-00991` has ₱45,696.00 principal + ₱3,084.48 interest − ₱2,856.00 discount = ₱45,924.48 cash, while an earlier ₱82,402.52 receipt contains multiple FAAS records and the matching FAAS's lines total ₱28,642.52 principal plus ₱3,814.12 interest. Do not attribute the whole receipt amount to one TD.
- Keep `lastyearpaid` and `lastqtrpaid` as informational eTRACS fields (for example, “Paid through 2026 Q4”); eTRACS remains the official current tax record.

### Year-end projection

- On successful sync, also calculate a separate estimate as if eTRACS computed the bill on December 31 of the current `Asia/Manila` calendar year. Include through Q4 and exclude ledger items for years after that projection year.
- Base the estimate on eTRACS `rptledger_item` principal and non-voided `rptpayment_item` principal allocations recorded through sync time. Apply the deployed year-end billing rules: prior-year monthly penalties (72% cap for 1992-and-later years), Q1–Q3 current-year penalties, and the Q4 10% discount. Tax-difference items do not receive those charges.
- Assume no payments after the sync. Store the estimate and projection year separately from the current eTRACS principal snapshot and LedgerDex-local figures. Label it clearly as a projection, not a generated eTRACS bill. Special bill options that are not represented in the ledger rows are outside this estimate.

## Persistence

- Add or replace the one-to-one latest eTRACS snapshot associated with the existing `DelinquentAccount`, containing the matched FAAS ID, principal amount due/paid/balance, derived authoritative eTRACS status, optional last-paid year/quarter, and `syncedAt`. This snapshot is the LedgerDex record of the latest official eTRACS state, not a new account.
- Refresh the account's property detail columns from successful eTRACS values. Preserve LedgerDex-imported totals and local settlement records as LedgerDex history/reference; do not use them to calculate or override the official eTRACS snapshot. Sync does not delete or rewrite settlement records.
- Repeated syncs replace the latest eTRACS snapshot and are safe to retry. Do not store raw eTRACS payment rows or unrelated FAAS data.

## Server and access control

- The browser calls a LedgerDex server route for the selected account. eTRACS connection settings and credentials remain on the server and are never returned to the browser.
- Configure a dedicated eTRACS database identity with SELECT-only grants and keep its connection settings in server environment configuration. If the current eTRACS account cannot be proven read-only, do not enable the sync route with that account.
- Use parameterized SQL for TD/FAAS values, finite query timeouts, and bounded result sets. Query only the exact ledger and linked detail rows required for that account.
- Require the same LedgerDex write permission used for account updates, since the successful result changes LedgerDex. Record a LedgerDex audit event for each successful sync without logging database credentials.

## Failure and data-safety rules

- No match, multiple ledger matches, unresolved required property mapping, unavailable database, timeout, or invalid numeric values must fail without a partial LedgerDex update.
- Fetch and validate all source values first, then persist the property refresh and latest snapshot atomically in LedgerDex.
- Do not expose SQL errors, hostnames, credentials, or raw eTRACS rows in the browser response.
- The integration has no background polling, bulk sync, eTRACS write operation, receipt import, or local settlement mutation in this scope.

## Acceptance criteria

1. The detail page has a Sync eTRACS button beside Delete Account; clicking it refreshes the selected LedgerDex TD account in place without creating a duplicate.
2. Sync queries eTRACS by the selected account's exact TD, follows its matched FAAS, ignores voided receipts, and does not use whole-receipt amounts as per-TD paid totals.
3. The eTRACS summary is clearly marked as the authoritative current tax state; LedgerDex totals and settlement rows remain labeled as local history/reference.
4. A successful sync refreshes eligible property details and the latest eTRACS snapshot; a failure leaves both unchanged.
5. eTRACS credentials stay server-side, SQL is parameterized, and the configured eTRACS account is restricted to SELECT access.
6. eTRACS is identified in the detail page as the authoritative source for current tax due, paid, balance, and status. LedgerDex totals and settlement history do not override that official state.
7. A successful sync saves and displays the separate estimated eTRACS bill through December 31 of the current Manila calendar year, including Q4 and currently recorded payments, without modifying the current principal snapshot or LedgerDex local settlement data.

## Review assumptions

- Please review whether the proposed **principal-only** meaning for amount due/paid/balance is the intended comparison. In particular, interest and discounts are deliberately excluded from those official summary amounts, while last-paid year/quarter is shown separately.
- eTRACS reference-table names and the exact field for each display label must be confirmed during implementation from the database metadata; unresolved labels must not be written over existing LedgerDex values.
