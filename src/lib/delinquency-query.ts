import { Prisma } from "@/generated/prisma";
import type { PrismaClient } from "@/generated/prisma";
import { EtracsStatus, SettlementStatus } from "@/types";
import { getAccountDisplayStatus, getEtracsStatusForBalance } from "@/lib/delinquency";

/**
 * Shared WHERE-builder for delinquent-account queries, used by both the
 * accounts list API and the Excel export route so filters stay identical.
 */
export function buildAccountWhere(sp: URLSearchParams, displayStatusAccountIds?: string[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AND: any[] = [];

  const search = sp.get("search");
  if (search) {
    AND.push({
      OR: [
        { taxpayerName: { contains: search } },
        { tdNumber: { contains: search } },
        { pin: { contains: search } },
        { cadastralLotNo: { contains: search } },
        { barangay: { contains: search } },
      ],
    });
  }

  const listId = sp.get("listId");
  if (listId) AND.push({ listId });

  const municipality = sp.get("municipality");
  if (municipality) AND.push({ list: { municipality } });

  const barangay = sp.get("barangay");
  if (barangay) AND.push({ barangay: { contains: barangay } });

  const classCode = sp.get("classCode");
  if (classCode) AND.push({ classCode });

  const rpuType = sp.get("rpuType");
  if (rpuType) AND.push({ rpuType });

  const status = sp.get("status");
  if (status) AND.push({ id: { in: displayStatusAccountIds ?? [] } });

  const present = sp.get("present");
  if (present === "true") AND.push({ isPresent: true });
  if (present === "false") AND.push({ isPresent: false });

  const minAmount = sp.get("minAmount");
  if (minAmount && !Number.isNaN(Number(minAmount))) AND.push({ amountDue: { gte: Number(minAmount) } });

  const maxAmount = sp.get("maxAmount");
  if (maxAmount && !Number.isNaN(Number(maxAmount))) AND.push({ amountDue: { lte: Number(maxAmount) } });

  // "started on or before" — surfaces the oldest delinquencies.
  const fromYear = sp.get("fromYear");
  if (fromYear && !Number.isNaN(Number(fromYear))) AND.push({ delinquentFromYear: { lte: Number(fromYear) } });

  return AND.length ? { AND } : {};
}

export type AccountSort = "rowNo" | "amount" | "balance" | "taxpayer" | "period" | "recent";

interface EtracsStatusRow {
  accountId: string;
  status: EtracsStatus;
  balance: unknown;
  projectedAmountDue: unknown;
}

export interface EtracsAccountBalance {
  balance: number;
  status: EtracsStatus;
  projectedAmountDue: number | null;
}

/** Fetch the current eTRACS balance and status used by the account list. */
export async function getEtracsBalancesForAccountIds(
  client: PrismaClient,
  accountIds: string[]
): Promise<Map<string, EtracsAccountBalance>> {
  const balances = new Map<string, EtracsAccountBalance>();
  const batchSize = 5000;

  for (let offset = 0; offset < accountIds.length; offset += batchSize) {
    const batch = accountIds.slice(offset, offset + batchSize);
    const placeholders = batch.map(() => "?").join(", ");
    const rows = await client.$queryRawUnsafe<EtracsStatusRow[]>(
      `SELECT accountId, balance, projectedAmountDue, status
       FROM etracs_sync_snapshots
       WHERE accountId IN (${placeholders})`,
      ...batch
    );
    for (const row of rows) {
      const balance = Number(row.balance);
      balances.set(row.accountId, {
        balance,
        status: getEtracsStatusForBalance(row.status, balance),
        projectedAmountDue: row.projectedAmountDue == null
          ? null
          : Number(row.projectedAmountDue),
      });
    }
  }

  return balances;
}

/** Fetch only eTRACS status; the related payment-history JSON can be large. */
export async function getEtracsStatusesForAccountIds(
  client: PrismaClient,
  accountIds: string[]
): Promise<Map<string, EtracsStatus>> {
  const statuses = new Map<string, EtracsStatus>();
  const figures = await getEtracsBalancesForAccountIds(client, accountIds);
  for (const [accountId, values] of figures) {
    statuses.set(accountId, values.status);
  }
  return statuses;
}

/** IDs whose displayed status matches the requested filter, including eTRACS overrides. */
export async function getAccountIdsWithDisplayStatus(
  client: PrismaClient,
  sp: URLSearchParams
): Promise<string[] | undefined> {
  const requestedStatus = sp.get("status") as SettlementStatus | null;
  if (!requestedStatus) return undefined;

  const unfiltered = new URLSearchParams(sp);
  unfiltered.delete("status");
  const candidates = await client.delinquentAccount.findMany({
    where: buildAccountWhere(unfiltered),
    select: { id: true, status: true, balance: true },
  });
  const etracsBalances = await getEtracsBalancesForAccountIds(
    client,
    candidates.map((account) => account.id)
  );

  return candidates
    .filter((account) => {
      const etracs = etracsBalances.get(account.id);
      return getAccountDisplayStatus(
        account.status,
        etracs?.status,
        etracs?.balance ?? Number(account.balance)
      ) === requestedStatus;
    })
    .map((account) => account.id);
}

export function buildAccountOrderBy(
  sort: string | null
): Prisma.DelinquentAccountOrderByWithRelationInput[] {
  switch (sort) {
    case "taxpayer":
      return [{ taxpayerName: "asc" }];
    case "period":
      return [{ delinquentFromYear: "asc" }];
    case "recent":
      return [{ createdAt: "desc" }];
    case "amount":
      return [{ amountDue: "desc" }];
    case "balance":
      return [{ balance: "desc" }];
    case "rowNo":
    default:
      // PDF order: the "NO." column, grouped by municipality so multiple lists
      // don't interleave. This mirrors how the accounts appear in the source PDF.
      return [{ list: { municipality: "asc" } }, { rowNo: "asc" }];
  }
}
