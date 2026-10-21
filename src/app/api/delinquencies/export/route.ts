import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import {
  buildAccountWhere,
  buildAccountOrderBy,
  getAccountIdsWithDisplayStatus,
  getEtracsStatusesForAccountIds,
} from "@/lib/delinquency-query";
import {
  RPU_TYPE_LABELS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_COLORS,
  formatQuarterPeriod,
  getAccountDisplayStatus,
} from "@/lib/delinquency";
import { SettlementStatus } from "@/types";

const COLS = [
  { header: "TD No.", width: 22 },
  { header: "PIN", width: 24 },
  { header: "Municipality", width: 16 },
  { header: "Barangay", width: 16 },
  { header: "Class", width: 8 },
  { header: "RPU Type", width: 14 },
  { header: "Area (sqm)", width: 12 },
  { header: "Taxpayer", width: 34 },
  { header: "Cadastral Lot", width: 16 },
  { header: "Delinquent From", width: 14 },
  { header: "Delinquent To", width: 14 },
  { header: "Amount Due", width: 16 },
  { header: "Amount Paid", width: 16 },
  { header: "Balance", width: 16 },
  { header: "Status", width: 16 },
];
const TOTAL_COLS = COLS.length;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const statusAccountIds = await getAccountIdsWithDisplayStatus(prisma, sp);
    const where = buildAccountWhere(sp, statusAccountIds);

    const accounts = await prisma.delinquentAccount.findMany({
      where,
      orderBy: buildAccountOrderBy(sp.get("sort")),
      include: { list: { select: { municipality: true } } },
    });
    const etracsStatuses = await getEtracsStatusesForAccountIds(prisma, accounts.map((account) => account.id));

    const wb = new ExcelJS.Workbook();
    wb.creator = "LedgerDex";
    wb.created = new Date();
    const ws = wb.addWorksheet("Delinquent Accounts");
    ws.columns = COLS.map((c) => ({ header: c.header, width: c.width }));

    const headerRow = ws.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF991B1B" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TOTAL_COLS } };

    const grouped = new Map<string, typeof accounts>();
    for (const a of accounts) {
      const key = a.list?.municipality ?? "UNKNOWN";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(a);
    }

    let rowIdx = 2;
    for (const [muni, accs] of grouped) {
      const groupRow = ws.getRow(rowIdx);
      groupRow.height = 17;
      const gc = groupRow.getCell(1);
      gc.value = `${muni.toUpperCase()}  ·  ${accs.length} accounts`;
      gc.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      gc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
      gc.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      ws.mergeCells(rowIdx, 1, rowIdx, TOTAL_COLS);
      rowIdx++;

      for (let i = 0; i < accs.length; i++) {
        const a = accs[i];
        const row = ws.getRow(rowIdx);
        row.height = 15;
        const rowBg = i % 2 === 0 ? "FFFFFFFF" : "FFF8FAFC";

        const values = [
          a.tdNumber,
          a.pin ?? "",
          a.list?.municipality ?? "",
          a.barangay ?? "",
          a.classCode ?? "",
          RPU_TYPE_LABELS[a.rpuType] ?? a.rpuType,
          a.areaSqm != null ? Number(a.areaSqm) : null,
          a.taxpayerName,
          a.cadastralLotNo ?? "",
          formatQuarterPeriod(a.delinquentFromYear, a.delinquentFromQuarter),
          formatQuarterPeriod(a.delinquentToYear, a.delinquentToQuarter),
          Number(a.amountDue),
          Number(a.amountPaid),
          Number(a.balance),
          SETTLEMENT_STATUS_LABELS[getAccountDisplayStatus(
            a.status as SettlementStatus,
            etracsStatuses.get(a.id),
            Number(a.balance)
          )],
        ];

        values.forEach((val, ci) => {
          const cell = row.getCell(ci + 1);
          cell.value = val as ExcelJS.CellValue;
          cell.font = { size: 9, color: { argb: "FF1E293B" } };
          cell.alignment = { vertical: "middle" };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
          if ((ci === 11 || ci === 12 || ci === 13) && typeof val === "number") {
            cell.numFmt = '"₱"#,##0.00';
          }
          if (ci === 6 && typeof val === "number") cell.numFmt = "#,##0.##";
        });

        const st = SETTLEMENT_STATUS_COLORS[getAccountDisplayStatus(
          a.status as SettlementStatus,
          etracsStatuses.get(a.id),
          Number(a.balance)
        )];
        if (st) {
          const cell = row.getCell(15);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${st.hex}` } };
          cell.font = {
            bold: true,
            size: 9,
            color: { argb: `FF${st.text.map((n) => n.toString(16).padStart(2, "0")).join("")}` },
          };
          cell.alignment = { vertical: "middle", horizontal: "center" };
        }
        rowIdx++;
      }
    }

    ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1, activeCell: "A2" }];
    const buffer = await wb.xlsx.writeBuffer();
    const generated = new Date().toISOString().slice(0, 10);

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="delinquent-accounts-${generated}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[delinquencies/export]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
