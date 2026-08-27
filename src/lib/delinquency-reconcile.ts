import { ParsedDelinquentRow, SettlementStatus } from "@/types";

/**
 * Pure reconciliation for the "one living list per municipality" model.
 * Given the accounts already stored for a municipality's list and the freshly
 * parsed rows of a newer snapshot, decide what to create / update / resolve.
 *
 * Rules (see the design spec):
 *  - Row matches an existing account by TD number → update (preserve settlement
 *    + status). If the existing account was SETTLED, flag reappearedAfterSettle.
 *  - Row has no match → create as OUTSTANDING.
 *  - Existing account that was on the list (isPresent) but is absent from this
 *    snapshot → mark absent; RESOLVE it unless it is already SETTLED.
 *  - Duplicate TD within the same file → last occurrence wins.
 */

export interface ExistingAccountLite {
  id: string;
  tdNumber: string;
  status: SettlementStatus;
  isPresent: boolean;
}

export interface ReconcilePlan {
  toCreate: ParsedDelinquentRow[];
  toUpdate: { id: string; row: ParsedDelinquentRow; reappearedAfterSettle: boolean }[];
  /** Previously-present accounts now gone: RESOLVE (was outstanding/partial). */
  toResolve: string[];
  /** Previously-present SETTLED accounts now gone: mark absent, keep SETTLED. */
  toMarkAbsent: string[];
  totalAmountDue: number;
  counts: {
    rowsParsed: number;
    added: number;
    updated: number;
    resolved: number;
    reappeared: number;
  };
}

export function reconcile(
  existing: ExistingAccountLite[],
  parsedRows: ParsedDelinquentRow[]
): ReconcilePlan {
  // Dedupe parsed rows by TD (last occurrence wins).
  const parsedByTd = new Map<string, ParsedDelinquentRow>();
  for (const row of parsedRows) {
    if (row.tdNumber) parsedByTd.set(row.tdNumber, row);
  }

  const existingByTd = new Map<string, ExistingAccountLite>();
  for (const acc of existing) existingByTd.set(acc.tdNumber, acc);

  const toCreate: ParsedDelinquentRow[] = [];
  const toUpdate: ReconcilePlan["toUpdate"] = [];
  let reappeared = 0;
  let totalAmountDue = 0;

  for (const [td, row] of parsedByTd) {
    totalAmountDue += Number(row.amountDue) || 0;
    const match = existingByTd.get(td);
    if (match) {
      const reappearedAfterSettle = match.status === "SETTLED";
      if (reappearedAfterSettle) reappeared++;
      toUpdate.push({ id: match.id, row, reappearedAfterSettle });
    } else {
      toCreate.push(row);
    }
  }

  // Accounts that were on the list but are gone from this snapshot.
  const toResolve: string[] = [];
  const toMarkAbsent: string[] = [];
  for (const acc of existing) {
    if (parsedByTd.has(acc.tdNumber)) continue; // still present
    if (!acc.isPresent) continue; // already off the list
    if (acc.status === "SETTLED") toMarkAbsent.push(acc.id);
    else if (acc.status !== "RESOLVED") toResolve.push(acc.id);
  }

  return {
    toCreate,
    toUpdate,
    toResolve,
    toMarkAbsent,
    totalAmountDue,
    counts: {
      rowsParsed: parsedByTd.size,
      added: toCreate.length,
      updated: toUpdate.length,
      resolved: toResolve.length,
      reappeared,
    },
  };
}
