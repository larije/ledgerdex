import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { formatQuarter, getPropertyTypeLabel } from "@/lib/utils";
import { PaymentStatus, PropertyType } from "@/types";

const STATUS_STYLE: Record<PaymentStatus, { bg: string; fg: string; border?: string }> = {
  DELINQUENT: { bg: "FFCDD2", fg: "B71C1C" },
  UNPAID:     { bg: "FFE0B2", fg: "E65100" },
  PARTIAL:    { bg: "FFF9C4", fg: "F57F17" },
  ADVANCE:    { bg: "BBDEFB", fg: "0D47A1" },
  CURRENT:    { bg: "C8E6C9", fg: "1B5E20", border: "2E7D32" },
  PAID:       { bg: "E8F5E9", fg: "1B5E20" },
};

const COLS = [
  { header: "Property Index No.", width: 24 },
  { header: "Property Location",  width: 32 },
  { header: "Municipality",       width: 20 },
  { header: "Barangay",           width: 18 },
  { header: "Lot/Block No.",      width: 14 },
  { header: "Class",              width: 8  },
  { header: "Type",               width: 14 },
  { header: "Area (sqm)",         width: 12 },
  { header: "Market Value",       width: 18 },
  { header: "Assessed Value",     width: 18 },
  { header: "Effectivity",        width: 11 },
  { header: "Taxability",         width: 12 },
  { header: "Taxes Begin",        width: 12 },
  { header: "Payment Status",     width: 16 },
  { header: "Paid Up To",         width: 12 },
];

const TOTAL_COLS = COLS.length;
const LAST_COL_LETTER = "O"; // column 15

export async function GET(req: NextRequest) {
  try {
  const sp = req.nextUrl.searchParams;
  const where: Record<string, unknown> = {};
  const municipality = sp.get("municipality");
  const status       = sp.get("status");
  const type         = sp.get("type");
  const taxability   = sp.get("taxability");
  const effectivity  = sp.get("effectivity");
  const documentId   = sp.get("documentId");

  if (municipality) where.municipality = municipality;
  if (status)       where.paymentStatus = status;
  if (type)         where.type = type;
  if (taxability)   where.taxability = taxability;
  if (effectivity)  where.effectivity = parseInt(effectivity);
  if (documentId)   where.documentId = documentId;

  const properties = await prisma.property.findMany({
    where,
    orderBy: [{ municipality: "asc" }, { barangay: "asc" }, { propertyIndexNo: "asc" }],
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "LedgerDex";
  wb.created = new Date();

  const ws = wb.addWorksheet("Properties");

  ws.columns = COLS.map((c) => ({ header: c.header, width: c.width }));

  // Style header row
  const headerRow = ws.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF1E40AF" } },
    };
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TOTAL_COLS } };

  // Group by municipality
  const grouped = new Map<string, typeof properties>();
  for (const p of properties) {
    const key = p.municipality ?? "UNKNOWN";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  let rowIdx = 2;

  for (const [muni, props] of grouped) {
    const barangays = [...new Set(props.map((p) => p.barangay).filter(Boolean))].join(", ");
    const label = `${muni} | Barangays: ${barangays}`;

    // Group header — merged row
    const groupRow = ws.getRow(rowIdx);
    groupRow.height = 17;
    const groupCell = groupRow.getCell(1);
    groupCell.value = label;
    groupCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9, italic: false };
    groupCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    groupCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    ws.mergeCells(rowIdx, 1, rowIdx, TOTAL_COLS);
    rowIdx++;

    // Data rows
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      const row = ws.getRow(rowIdx);
      row.height = 15;

      const isEven = i % 2 === 0;
      const rowBg = isEven ? "FFFFFFFF" : "FFF8FAFC";

      const values = [
        p.propertyIndexNo  ?? "",
        p.propertyLocation ?? "",
        p.municipality     ?? "",
        p.barangay         ?? "",
        p.lotBlockNo       ?? "",
        p.class            ?? "",
        getPropertyTypeLabel(p.type as PropertyType),
        p.area       != null ? Number(p.area)       : null,
        p.marketValue   != null ? Number(p.marketValue)   : null,
        p.assessedValue != null ? Number(p.assessedValue) : null,
        p.effectivity   ?? "",
        p.taxability,
        formatQuarter(p.taxesBeginYear, p.taxesBeginQuarter),
        p.paymentStatus,
        formatQuarter(p.paidUpToYear, p.paidUpToQuarter),
      ];

      values.forEach((val, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = val as ExcelJS.CellValue;
        cell.font = { size: 9, color: { argb: "FF1E293B" } };
        cell.alignment = { vertical: "middle" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };

        // Currency columns: Market Value (col 9) and Assessed Value (col 10)
        if ((ci === 8 || ci === 9) && typeof val === "number") {
          cell.numFmt = '"₱"#,##0.00';
        }

        // Area column: number with commas
        if (ci === 7 && typeof val === "number") {
          cell.numFmt = "#,##0.##";
        }
      });

      // Payment status cell (column 14)
      const statusKey = p.paymentStatus as PaymentStatus;
      const st = STATUS_STYLE[statusKey];
      if (st) {
        const cell = row.getCell(14);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${st.bg}` } };
        cell.font = { bold: true, size: 9, color: { argb: `FF${st.fg}` } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        if (st.border) {
          cell.border = {
            top:    { style: "medium", color: { argb: `FF${st.border}` } },
            bottom: { style: "medium", color: { argb: `FF${st.border}` } },
            left:   { style: "medium", color: { argb: `FF${st.border}` } },
            right:  { style: "medium", color: { argb: `FF${st.border}` } },
          };
        }
      }

      rowIdx++;
    }
  }

  // Freeze header row
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1, activeCell: "A2" }];

  const buffer = await wb.xlsx.writeBuffer();

  const generated = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ledgerdex-properties-${generated}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
  } catch (err) {
    console.error("[export/excel]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
