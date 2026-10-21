import { EtracsStatus, RpuType, SettlementStatus } from "@/types";

// ── Labels ────────────────────────────────────────────────────

export const RPU_TYPE_LABELS: Record<RpuType, string> = {
  LAND: "Land",
  BLDG: "Building",
  MACH: "Machinery",
  PLANTTREE: "Plants & Trees",
  MISC: "Miscellaneous",
};

export const CLASS_CODE_LABELS: Record<string, string> = {
  A: "Agricultural",
  R: "Residential",
  C: "Commercial",
  I: "Industrial",
  S: "Special",
  T: "Timberland",
  M: "Mineral",
};

export function classCodeLabel(code?: string | null): string {
  if (!code) return "—";
  return CLASS_CODE_LABELS[code.toUpperCase().trim()] ?? code;
}

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  OUTSTANDING: "Outstanding",
  PARTIAL: "Partially Settled",
  SETTLED: "Settled",
  RESOLVED: "Resolved",
};

/** A zero or negative balance has no amount outstanding, so show it as settled. */
export function getSettlementStatusForBalance(
  status: SettlementStatus,
  balance: number
): SettlementStatus {
  if (status === "RESOLVED") return status;
  return balance <= 0 ? "SETTLED" : status;
}

/** Treat an eTRACS zero balance as settled, even when a stored status is stale. */
export function getEtracsStatusForBalance(
  status: EtracsStatus,
  balance: number
): EtracsStatus {
  return balance <= 0 ? "SETTLED" : status;
}

/** A zero local balance settles the account; otherwise prefer the latest eTRACS status. */
export function getAccountDisplayStatus(
  localStatus: SettlementStatus,
  etracsStatus?: EtracsStatus | null,
  localBalance?: number | null
): SettlementStatus {
  const balanceAwareLocalStatus = localBalance == null
    ? localStatus
    : getSettlementStatusForBalance(localStatus, localBalance);
  if (localBalance != null && localBalance <= 0) return balanceAwareLocalStatus;
  return etracsStatus ?? balanceAwareLocalStatus;
}

/** Badge variant (matches components/ui/Badge variants) per status. */
export const SETTLEMENT_STATUS_VARIANT: Record<
  SettlementStatus,
  "default" | "success" | "warning" | "danger" | "info"
> = {
  OUTSTANDING: "danger",
  PARTIAL: "warning",
  SETTLED: "success",
  RESOLVED: "default",
};

/** RGB hex fill/text for PDF/Excel export cells, per status. */
export const SETTLEMENT_STATUS_COLORS: Record<
  SettlementStatus,
  { fill: [number, number, number]; text: [number, number, number]; hex: string }
> = {
  OUTSTANDING: { fill: [255, 205, 210], text: [183, 28, 28], hex: "FFCDD2" },
  PARTIAL: { fill: [255, 249, 196], text: [245, 127, 23], hex: "FFF9C4" },
  SETTLED: { fill: [200, 230, 201], text: [27, 94, 32], hex: "C8E6C9" },
  RESOLVED: { fill: [226, 232, 240], text: [71, 85, 105], hex: "E2E8F0" },
};

// ── Formatting ────────────────────────────────────────────────

export function formatQuarterPeriod(
  year?: number | null,
  quarter?: number | null
): string {
  if (!year) return "—";
  if (!quarter) return String(year);
  return `${year}-Q${quarter}`;
}

/** "2018-Q1 → 2026-Q4" style range used in the delinquency period column. */
export function formatDelinquentPeriod(
  fromYear?: number | null,
  fromQuarter?: number | null,
  toYear?: number | null,
  toQuarter?: number | null
): string {
  const from = formatQuarterPeriod(fromYear, fromQuarter);
  const to = formatQuarterPeriod(toYear, toQuarter);
  if (from === "—" && to === "—") return "—";
  if (to === "—") return from;
  if (from === "—") return to;
  return `${from} → ${to}`;
}

/** Number of years of arrears (approx), used for "oldest delinquencies". */
export function arrearsYears(
  fromYear?: number | null,
  toYear?: number | null
): number | null {
  if (!fromYear || !toYear) return null;
  return Math.max(0, toYear - fromYear + 1);
}

// ── Status derivation ─────────────────────────────────────────

/**
 * Derive a settlement status from the money figures. Never downgrades a
 * manually/previously SETTLED account and never touches RESOLVED — the caller
 * passes the current status so those terminal states are preserved.
 */
export function deriveStatus(
  amountDue: number,
  amountPaid: number,
  current?: SettlementStatus
): SettlementStatus {
  if (current === "SETTLED" || current === "RESOLVED") return current;
  if (amountDue - amountPaid <= 0) return "SETTLED";
  if (amountPaid <= 0) return "OUTSTANDING";
  return "PARTIAL";
}
