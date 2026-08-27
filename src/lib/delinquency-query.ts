/**
 * Shared WHERE-builder for delinquent-account queries, used by both the
 * accounts list API and the Excel export route so filters stay identical.
 */
export function buildAccountWhere(sp: URLSearchParams) {
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
  if (status) AND.push({ status });

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

import { Prisma } from "@/generated/prisma";

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
