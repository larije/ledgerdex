import "server-only";
import { PrismaClient } from "@/generated/prisma";
import type { EtracsPaymentRecord, EtracsStatus, RpuType } from "@/types";

export type EtracsSyncErrorCode =
  | "NOT_CONFIGURED"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "INVALID_DATA";

export class EtracsSyncError extends Error {
  constructor(readonly code: EtracsSyncErrorCode) {
    super(code);
    this.name = "EtracsSyncError";
  }
}

export interface EtracsAccountData {
  faasId: string;
  pin?: string;
  classCode?: string;
  rpuType?: RpuType;
  taxpayerName?: string;
  cadastralLotNo?: string;
  amountDue: string;
  amountPaid: string;
  balance: string;
  projectedAmountDue: string;
  projectionYear: number;
  status: EtracsStatus;
  lastPaidYear: number | null;
  lastPaidQuarter: number | null;
  paymentHistory: EtracsPaymentRecord[];
  paymentHistoryTruncated: boolean;
}

interface EtracsLedgerRow {
  ledger_id: unknown;
  faas_id: unknown;
  pin: unknown;
  class_code: unknown;
  rpu_type: unknown;
  taxpayer_name: unknown;
  cadastral_lot_no: unknown;
  amount_due: unknown;
  amount_paid: unknown;
  last_paid_year: unknown;
  last_paid_quarter: unknown;
}

interface EtracsLedgerItemRow {
  item_faas_id: unknown;
  year: unknown;
  revtype: unknown;
  amount: unknown;
  amtpaid: unknown;
  taxdifference: unknown;
  fromqtr: unknown;
  toqtr: unknown;
}

interface EtracsPaymentPeriodRow {
  item_faas_id: unknown;
  year: unknown;
  qtr: unknown;
  revtype: unknown;
  principal_paid: unknown;
}

interface EtracsPaymentHistoryRow {
  payment_id: unknown;
  receipt_no: unknown;
  receipt_date: unknown;
  paid_by: unknown;
  from_year: unknown;
  from_quarter: unknown;
  to_year: unknown;
  to_quarter: unknown;
  voided: unknown;
  principal: unknown;
  interest: unknown;
  discount: unknown;
  amnesty: unknown;
}

export function normalizeEtracsPaymentHistory(value: unknown): EtracsPaymentRecord[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  const nullableInteger = (item: unknown) => item == null || (typeof item === "number" && Number.isInteger(item));
  return parsed.filter((item): item is EtracsPaymentRecord =>
    item != null && typeof item === "object"
    && typeof item.paymentId === "string"
    && (item.receiptNo == null || typeof item.receiptNo === "string")
    && (item.receiptDate == null || typeof item.receiptDate === "string")
    && (item.paidBy == null || typeof item.paidBy === "string")
    && nullableInteger(item.fromYear)
    && nullableInteger(item.fromQuarter)
    && nullableInteger(item.toYear)
    && nullableInteger(item.toQuarter)
    && typeof item.principal === "string"
    && typeof item.interest === "string"
    && typeof item.discount === "string"
    && typeof item.amnesty === "string"
    && typeof item.voided === "boolean"
  );
}

interface ProjectionTaxLine {
  itemFaasId: string;
  year: number;
  revtype: string;
  amountCents: bigint;
  itemPaidCents: bigint;
  taxDifference: boolean;
  fromQuarter: number;
  toQuarter: number;
}

interface ProjectionPaymentBucket {
  annualCents: bigint;
  quarterCents: Map<number, bigint>;
}

const globalForEtracs = globalThis as unknown as { etracsPrisma?: PrismaClient };
const MAX_PROJECTION_ROWS = 50_000;

function connectionUrl(): string {
  if (process.env.ETRACS_READ_ONLY_CONFIRMED !== "true") {
    throw new EtracsSyncError("NOT_CONFIGURED");
  }
  const configured = process.env.ETRACS_DATABASE_URL?.trim();
  if (!configured) throw new EtracsSyncError("NOT_CONFIGURED");

  try {
    const url = new URL(configured);
    if (url.protocol !== "mysql:" || !url.hostname || !url.pathname || url.pathname === "/") {
      throw new Error("Invalid MySQL URL");
    }
    // Keep the eTRACS pool bounded and allow large account histories enough
    // time to load, even if these options are omitted or loosened in the URL.
    url.searchParams.set("connection_limit", "2");
    url.searchParams.set("pool_timeout", "10");
    url.searchParams.set("connect_timeout", "5");
    url.searchParams.set("socket_timeout", "120");
    return url.toString();
  } catch {
    throw new EtracsSyncError("NOT_CONFIGURED");
  }
}

function getEtracsClient(): PrismaClient {
  const url = connectionUrl();
  if (!globalForEtracs.etracsPrisma) {
    globalForEtracs.etracsPrisma = new PrismaClient({
      datasourceUrl: url,
      log: [],
    });
  }
  return globalForEtracs.etracsPrisma;
}

function decimalToCents(value: unknown): bigint {
  const text = String(value);
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new EtracsSyncError("INVALID_DATA");

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  const cents = whole * 100n + fraction;
  // EtracsSyncSnapshot uses DECIMAL(15,2).
  if (cents > 999_999_999_999_999n) throw new EtracsSyncError("INVALID_DATA");
  return cents;
}

function centsToDecimal(cents: bigint): string {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

function parseInteger(value: unknown, min: number, max: number): number {
  const text = String(value);
  if (!/^-?\d+$/.test(text)) throw new EtracsSyncError("INVALID_DATA");
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new EtracsSyncError("INVALID_DATA");
  }
  return parsed;
}

function roundCentsRatio(cents: bigint, numerator: number, denominator: number): bigint {
  if (cents <= 0n || numerator <= 0) return 0n;
  const top = cents * BigInt(numerator);
  return (top + BigInt(denominator) / 2n) / BigInt(denominator);
}

function addCents(target: Map<number, bigint>, key: number, amount: bigint) {
  target.set(key, (target.get(key) ?? 0n) + amount);
}

function getProjectionYear(): number {
  return Number(new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
  }).format(new Date()));
}

function splitAcrossQuarters(amountCents: bigint, fromQuarter: number, toQuarter: number) {
  const count = toQuarter - fromQuarter + 1;
  const regularQuarter = roundCentsRatio(amountCents, 1, count);
  let remaining = amountCents;
  const quarters: Array<{ quarter: number; amountCents: bigint }> = [];
  for (let quarter = fromQuarter; quarter <= toQuarter; quarter += 1) {
    const amount = quarter === toQuarter ? remaining : regularQuarter;
    quarters.push({ quarter, amountCents: amount });
    remaining -= amount;
  }
  return quarters;
}

/**
 * Estimate the eTRACS bill if computed on December 31 of the current
 * Philippines calendar year. This mirrors the deployed RPT billing rules:
 * capped monthly penalties for prior years, Q1-Q3 penalties, and the Q4
 * current-quarter discount. It intentionally excludes advance years.
 */
function computeYearEndProjection(
  itemRows: EtracsLedgerItemRow[],
  paymentRows: EtracsPaymentPeriodRow[],
  projectionYear: number,
): bigint {
  const items: ProjectionTaxLine[] = itemRows.map((row) => {
    const itemFaasId = optionalText(row.item_faas_id);
    if (!itemFaasId) throw new EtracsSyncError("INVALID_DATA");
    const year = parseInteger(row.year, 1900, projectionYear);
    const fromQuarter = row.fromqtr == null
      ? 1
      : parseInteger(row.fromqtr, 1, 4);
    const toQuarter = row.toqtr == null
      ? 4
      : parseInteger(row.toqtr, 1, 4);
    if ((row.fromqtr == null) !== (row.toqtr == null) || fromQuarter > toQuarter) {
      throw new EtracsSyncError("INVALID_DATA");
    }
    const revtype = optionalText(row.revtype)?.toLowerCase();
    if (!revtype) throw new EtracsSyncError("INVALID_DATA");
    const taxDifferenceValue = parseInteger(row.taxdifference, 0, 1);
    return {
      itemFaasId,
      year,
      revtype,
      amountCents: decimalToCents(row.amount),
      itemPaidCents: row.amtpaid == null ? 0n : decimalToCents(row.amtpaid),
      taxDifference: taxDifferenceValue === 1,
      fromQuarter,
      toQuarter,
    };
  });

  const itemKey = (faasId: string, year: number, revtype: string) => `${faasId}\u0000${year}\u0000${revtype}`;
  const itemsByKey = new Map<string, ProjectionTaxLine>();
  for (const item of items) {
    const key = itemKey(item.itemFaasId, item.year, item.revtype);
    // Payment rows identify their assessed line by rptledgerfaasid, year,
    // and revenue type. Refuse ambiguous duplicate keys instead of moving a
    // payment between a regular line and a tax-difference line.
    if (itemsByKey.has(key)) throw new EtracsSyncError("INVALID_DATA");
    itemsByKey.set(key, item);
  }

  const payments = new Map<string, ProjectionPaymentBucket>();
  for (const row of paymentRows) {
    const itemFaasId = optionalText(row.item_faas_id);
    if (!itemFaasId) throw new EtracsSyncError("INVALID_DATA");
    const year = parseInteger(row.year, 1900, projectionYear);
    const revtype = optionalText(row.revtype)?.toLowerCase();
    if (!revtype) throw new EtracsSyncError("INVALID_DATA");
    const key = itemKey(itemFaasId, year, revtype);
    if (!itemsByKey.has(key)) throw new EtracsSyncError("INVALID_DATA");
    const quarter = row.qtr == null || String(row.qtr) === "0"
      ? null
      : parseInteger(row.qtr, 1, 4);
    const bucket = payments.get(key) ?? { annualCents: 0n, quarterCents: new Map<number, bigint>() };
    const paidCents = decimalToCents(row.principal_paid);
    if (quarter == null) bucket.annualCents += paidCents;
    else addCents(bucket.quarterCents, quarter, paidCents);
    payments.set(key, bucket);
  }

  let projectedCents = 0n;
  for (const item of items) {
    const key = itemKey(item.itemFaasId, item.year, item.revtype);
    const paymentBucket = payments.get(key) ?? { annualCents: 0n, quarterCents: new Map<number, bigint>() };
    const quarterPaidTotal = [...paymentBucket.quarterCents.values()].reduce((sum, amount) => sum + amount, 0n);
    const paymentsTotal = paymentBucket.annualCents + quarterPaidTotal;
    const unmatchedStoredPaid = item.itemPaidCents > paymentsTotal ? item.itemPaidCents - paymentsTotal : 0n;

    if (item.year < projectionYear) {
      const recognizedPaid = paymentsTotal > item.itemPaidCents ? paymentsTotal : item.itemPaidCents;
      const paid = recognizedPaid < item.amountCents ? recognizedPaid : item.amountCents;
      const base = item.amountCents - paid;
      if (base === 0n) continue;

      let penalty = 0n;
      if (!item.taxDifference) {
        const months = (projectionYear - item.year + 1) * 12;
        if (item.year <= 1985) {
          penalty = roundCentsRatio(base, 24, 100);
        } else {
          const rateMonths = item.year <= 1991 ? months : Math.min(months, 36);
          penalty = roundCentsRatio(base, rateMonths * 2, 100);
        }
      }
      projectedCents += base + penalty;
      continue;
    }

    const quarterlyLines = splitAcrossQuarters(item.amountCents, item.fromQuarter, item.toQuarter)
      .map((line) => ({ ...line, taxDifference: item.taxDifference }));

    // Apply this assessed line's quarter-specific allocations first. The
    // source key is the eTRACS FAAS item ID, so payments cannot migrate
    // between tax-difference and regular assessment lines.
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      let paid = paymentBucket.quarterCents.get(quarter) ?? 0n;
      const line = quarterlyLines.find((entry) => entry.quarter === quarter);
      if (paid > 0n && !line) throw new EtracsSyncError("INVALID_DATA");
      if (line) {
        const applied = paid < line.amountCents ? paid : line.amountCents;
        line.amountCents -= applied;
      }
    }
    let annualPaid = paymentBucket.annualCents + unmatchedStoredPaid;
    for (const line of quarterlyLines.sort((a, b) => a.quarter - b.quarter)) {
      const applied = annualPaid < line.amountCents ? annualPaid : line.amountCents;
      line.amountCents -= applied;
      annualPaid -= applied;
    }

    for (const line of quarterlyLines) {
      const base = line.amountCents;
      if (base === 0n) continue;
      let penalty = 0n;
      let discount = 0n;
      if (!line.taxDifference) {
        if (line.quarter < 4 && (item.revtype === "basic" || item.revtype === "sef")) {
          const quarterStartMonth = (line.quarter - 1) * 3 + 1;
          const months = 12 - quarterStartMonth + 1;
          penalty = roundCentsRatio(base, months * 2, 100);
        } else if (line.quarter === 4) {
          discount = roundCentsRatio(base, 10, 100);
        }
      }
      projectedCents += base + penalty - discount;
    }
  }

  if (projectedCents > 999_999_999_999_999n) throw new EtracsSyncError("INVALID_DATA");
  return projectedCents;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

function optionalClassCode(value: unknown): string | undefined {
  const text = optionalText(value)?.toUpperCase();
  return text && ["A", "R", "C", "I", "S", "T", "M"].includes(text) ? text : undefined;
}

function optionalRpuType(value: unknown): RpuType | undefined {
  const text = optionalText(value)?.toLowerCase().replace(/[\s_/-]/g, "");
  const values: Record<string, RpuType> = {
    land: "LAND",
    bldg: "BLDG",
    building: "BLDG",
    mach: "MACH",
    machinery: "MACH",
    planttree: "PLANTTREE",
    plantstrees: "PLANTTREE",
    misc: "MISC",
    miscellaneous: "MISC",
  };
  return text ? values[text] : undefined;
}

function optionalPaidPeriod(yearValue: unknown, quarterValue: unknown) {
  const yearText = yearValue == null ? "0" : String(yearValue);
  if (!/^\d+$/.test(yearText)) throw new EtracsSyncError("INVALID_DATA");
  const year = Number(yearText);
  if (year === 0) {
    if (quarterValue == null || Number(quarterValue) === 0) return { year: null, quarter: null };
    throw new EtracsSyncError("INVALID_DATA");
  }
  if (year < 1900 || year > 2200) {
    throw new EtracsSyncError("INVALID_DATA");
  }
  if (!Number.isSafeInteger(year)) {
    throw new EtracsSyncError("INVALID_DATA");
  }
  if (quarterValue == null || Number(quarterValue) === 0) {
    return { year, quarter: null };
  }
  const quarterText = String(quarterValue);
  if (!/^\d+$/.test(quarterText)) {
    throw new EtracsSyncError("INVALID_DATA");
  }
  const quarter = Number(quarterText);
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    throw new EtracsSyncError("INVALID_DATA");
  }
  if (!Number.isSafeInteger(quarter)) throw new EtracsSyncError("INVALID_DATA");
  return { year, quarter };
}

function optionalInteger(value: unknown, min: number, max: number): number | null {
  return value == null ? null : parseInteger(value, min, max);
}

function optionalDate(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new EtracsSyncError("INVALID_DATA");
  return date.toISOString();
}

/** Fetches the exact TD and matches payment allocations to its ledger items using SELECT-only SQL. */
export async function fetchEtracsAccountData(tdNumber: string): Promise<EtracsAccountData> {
  try {
    const client = getEtracsClient();
    return await client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<EtracsLedgerRow[]>`
        SELECT
          l.objid AS ledger_id,
          l.faasid AS faas_id,
          l.fullpin AS pin,
          l.classcode AS class_code,
          l.rputype AS rpu_type,
          l.owner_name AS taxpayer_name,
          l.cadastrallotno AS cadastral_lot_no,
          l.lastyearpaid AS last_paid_year,
          l.lastqtrpaid AS last_paid_quarter,
          (SELECT COALESCE(SUM(i.amount), 0)
            FROM rptledger_item AS i
            WHERE i.parentid = l.objid) AS amount_due,
          (SELECT COALESCE(SUM(pi.amount), 0)
            FROM rptpayment_item AS pi
            INNER JOIN rptpayment AS p ON p.objid = pi.parentid
            WHERE EXISTS (
              SELECT 1
              FROM rptledger_item AS i
              WHERE i.parentid = l.objid
                AND i.rptledgerfaasid = pi.rptledgerfaasid
                AND i.year = pi.year
                AND i.revtype = pi.revtype
            )
              AND p.voided = 0) AS amount_paid
        FROM rptledger AS l
        WHERE BINARY l.tdno = BINARY ${tdNumber}
        LIMIT 2
      `;
      if (rows.length === 0) throw new EtracsSyncError("NOT_FOUND");
      if (rows.length > 1) throw new EtracsSyncError("AMBIGUOUS");

      const row = rows[0];
      const ledgerId = optionalText(row.ledger_id);
      const faasId = optionalText(row.faas_id);
      if (!ledgerId || !faasId) throw new EtracsSyncError("INVALID_DATA");

      const projectionYear = getProjectionYear();
      const itemRows = await tx.$queryRaw<EtracsLedgerItemRow[]>`
        SELECT rptledgerfaasid AS item_faas_id, year, revtype, amount, amtpaid, taxdifference, fromqtr, toqtr
        FROM rptledger_item
        WHERE parentid = ${ledgerId} AND year <= ${projectionYear}
        LIMIT ${MAX_PROJECTION_ROWS + 1}
      `;
      const paymentRows = await tx.$queryRaw<EtracsPaymentPeriodRow[]>`
        SELECT pi.rptledgerfaasid AS item_faas_id, pi.year, pi.qtr, pi.revtype,
          COALESCE(SUM(pi.amount), 0) AS principal_paid
        FROM rptpayment_item AS pi
        INNER JOIN rptpayment AS p ON p.objid = pi.parentid
        WHERE p.voided = 0
          AND pi.year <= ${projectionYear}
          AND EXISTS (
            SELECT 1
            FROM rptledger_item AS i
            WHERE i.parentid = ${ledgerId}
              AND i.rptledgerfaasid = pi.rptledgerfaasid
              AND i.year = pi.year
              AND i.revtype = pi.revtype
          )
        GROUP BY pi.rptledgerfaasid, pi.year, pi.qtr, pi.revtype
        LIMIT ${MAX_PROJECTION_ROWS + 1}
      `;
      // Receipt history follows the ledger's FAAS rows; old receipts may remain
      // after the corresponding current assessment rows have been cleared.
      const paymentHistoryRows = await tx.$queryRaw<EtracsPaymentHistoryRow[]>`
        SELECT
          p.objid AS payment_id,
          p.receiptno AS receipt_no,
          p.receiptdate AS receipt_date,
          p.paidby_name AS paid_by,
          p.fromyear AS from_year,
          p.fromqtr AS from_quarter,
          p.toyear AS to_year,
          p.toqtr AS to_quarter,
          p.voided AS voided,
          COALESCE(SUM(pi.amount), 0) AS principal,
          COALESCE(SUM(pi.interest), 0) AS interest,
          COALESCE(SUM(pi.discount), 0) AS discount,
          COALESCE(SUM(pi.amnesty), 0) AS amnesty
        FROM rptpayment_item AS pi
        INNER JOIN rptpayment AS p ON p.objid = pi.parentid
        WHERE EXISTS (
          SELECT 1
          FROM rptledgerfaas AS f
          WHERE f.rptledgerid = ${ledgerId}
            AND f.objid = pi.rptledgerfaasid
        )
        GROUP BY p.objid, p.receiptno, p.receiptdate, p.paidby_name,
          p.fromyear, p.fromqtr, p.toyear, p.toqtr, p.voided
        ORDER BY p.receiptdate DESC, p.objid DESC
        LIMIT 5001
      `;
      if (itemRows.length > MAX_PROJECTION_ROWS || paymentRows.length > MAX_PROJECTION_ROWS) {
        throw new EtracsSyncError("INVALID_DATA");
      }

      const paymentHistoryTruncated = paymentHistoryRows.length > 5000;
      const paymentHistory: EtracsPaymentRecord[] = paymentHistoryRows.slice(0, 5000).map((payment) => {
        const paymentId = optionalText(payment.payment_id);
        if (!paymentId) throw new EtracsSyncError("INVALID_DATA");
        const voided = parseInteger(payment.voided, 0, 1);
        return {
          paymentId,
          receiptNo: optionalText(payment.receipt_no) ?? null,
          receiptDate: optionalDate(payment.receipt_date),
          paidBy: optionalText(payment.paid_by) ?? null,
          fromYear: optionalInteger(payment.from_year, 0, 2200),
          fromQuarter: optionalInteger(payment.from_quarter, 0, 4),
          toYear: optionalInteger(payment.to_year, 0, 2200),
          toQuarter: optionalInteger(payment.to_quarter, 0, 4),
          principal: centsToDecimal(decimalToCents(payment.principal)),
          interest: centsToDecimal(decimalToCents(payment.interest)),
          discount: centsToDecimal(decimalToCents(payment.discount)),
          amnesty: centsToDecimal(decimalToCents(payment.amnesty)),
          voided: voided === 1,
        };
      });

      const amountDueCents = decimalToCents(row.amount_due);
      const amountPaidCents = decimalToCents(row.amount_paid);
      const balanceCents = amountDueCents > amountPaidCents ? amountDueCents - amountPaidCents : 0n;
      const projectedAmountDueCents = computeYearEndProjection(itemRows, paymentRows, projectionYear);
      const status: EtracsStatus = balanceCents === 0n
        ? "SETTLED"
        : amountPaidCents > 0n
          ? "PARTIAL"
          : "OUTSTANDING";
      const paidPeriod = optionalPaidPeriod(row.last_paid_year, row.last_paid_quarter);

      return {
        faasId,
        pin: optionalText(row.pin),
        classCode: optionalClassCode(row.class_code),
        rpuType: optionalRpuType(row.rpu_type),
        taxpayerName: optionalText(row.taxpayer_name),
        cadastralLotNo: optionalText(row.cadastral_lot_no),
        amountDue: centsToDecimal(amountDueCents),
        amountPaid: centsToDecimal(amountPaidCents),
        balance: centsToDecimal(balanceCents),
        projectedAmountDue: centsToDecimal(projectedAmountDueCents),
        projectionYear,
        status,
        lastPaidYear: paidPeriod.year,
        lastPaidQuarter: paidPeriod.quarter,
        paymentHistory,
        paymentHistoryTruncated,
      };
    }, {
      isolationLevel: "RepeatableRead",
      maxWait: 10_000,
      timeout: 120_000,
    });
  } catch (error) {
    if (error instanceof EtracsSyncError) throw error;
    if (isEtracsTimeoutError(error)) throw new EtracsSyncError("TIMEOUT");
    // Do not log/return Prisma errors: they may contain the connection URL.
    throw new EtracsSyncError("UNAVAILABLE");
  }
}

function isEtracsTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const errorCode = String(code ?? "");
  if (["P2024", "P2028", "ETIMEDOUT", "ESOCKETTIMEDOUT", "PROTOCOL_SEQUENCE_TIMEOUT"].includes(errorCode)) {
    return true;
  }
  return /timed?\s*out|timeout|transaction.{0,30}expired/i.test(String(message ?? ""));
}
