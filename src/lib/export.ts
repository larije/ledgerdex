import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Property } from "@/types";
import { formatCurrency, formatQuarter, getPropertyTypeLabel } from "./utils";

function propertiesToRows(properties: Property[]) {
  return properties.map((p) => [
    p.tdNumber,
    p.propertyIndexNo ?? "",
    p.propertyLocation ?? "",
    p.municipality ?? "",
    p.barangay ?? "",
    p.lotBlockNo ?? "",
    p.class ?? "",
    getPropertyTypeLabel(p.type),
    p.area?.toString() ?? "",
    formatCurrency(p.marketValue),
    formatCurrency(p.assessedValue),
    p.effectivity?.toString() ?? "",
    p.taxability,
    formatQuarter(p.taxesBeginYear, p.taxesBeginQuarter),
    p.paymentStatus,
    formatQuarter(p.paidUpToYear, p.paidUpToQuarter),
  ]);
}

const HEADERS = [
  "TD Number", "Property Index No.", "Property Location", "Municipality",
  "Barangay", "Lot/Block No.", "Class", "Type", "Area (sqm)",
  "Market Value", "Assessed Value", "Effectivity", "Taxability",
  "Taxes Begin", "Payment Status", "Paid Up To",
];

export function exportToExcel(properties: Property[], filename = "properties.xlsx") {
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...propertiesToRows(properties)]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Properties");
  XLSX.writeFile(wb, filename);
}

export async function exportToExcelStyled(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `/api/export/excel${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Export failed (${res.status}): ${body?.error ?? res.statusText}`);
  }
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = cd.match(/filename="([^"]+)"/);
  link.download = match?.[1] ?? "ledgerdex-properties.xlsx";
  link.click();
  URL.revokeObjectURL(link.href);
}

export function exportToCSV(properties: Property[], filename = "properties.csv") {
  const rows = [HEADERS, ...propertiesToRows(properties)];
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPDF(properties: Property[], filename = "properties.pdf") {
  const doc  = new jsPDF({ orientation: "landscape", format: "a4" });
  const PW   = doc.internal.pageSize.getWidth();
  const PH   = doc.internal.pageSize.getHeight();
  const M    = 12;
  const BAND = 26;

  const STATUS_COLORS: Record<string, { fill: [number,number,number]; text: [number,number,number] }> = {
    DELINQUENT: { fill: [255,205,210], text: [183, 28, 28] },
    UNPAID:     { fill: [255,224,178], text: [230, 81,  0] },
    PARTIAL:    { fill: [255,249,196], text: [245,127, 23] },
    ADVANCE:    { fill: [187,222,251], text: [ 13, 71,161] },
    CURRENT:    { fill: [200,230,201], text: [ 27, 94, 32] },
    PAID:       { fill: [232,245,233], text: [ 27, 94, 32] },
  };

  let pageNum = 0;

  const drawBanner = () => {
    doc.setFillColor(20, 45, 120);
    doc.rect(0, 0, PW, BAND - 3, "F");
    doc.setFillColor(59, 130, 246);
    doc.rect(0, BAND - 3, PW, 3, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text("PROPERTY TAX LEDGER", M, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Province of Davao del Norte  ·  LedgerDex", M, 18);

    const ts = new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
    doc.text(`Generated: ${ts}`, PW - M, 10, { align: "right" });
    doc.text(`${properties.length.toLocaleString()} records  ·  Page ${pageNum}`, PW - M, 18, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };

  const drawFooter = () => {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(M, PH - 9, PW - M, PH - 9);
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text("LedgerDex  —  Property Tax Management System", M, PH - 5.5);
    doc.text("CONFIDENTIAL  —  FOR OFFICIAL USE ONLY", PW - M, PH - 5.5, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };

  const fmtNum = (v: number | null | undefined) =>
    v == null ? "—" : new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  // Group by municipality
  const grouped = new Map<string, Property[]>();
  for (const p of properties) {
    const key = p.municipality ?? "Unknown";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  const COLS = [
    "TD No.", "Property Index No.", "Property Location",
    "Barangay", "Lot/Block", "Class", "Type",
    "Area (sqm)", "Market Value", "Assessed Value",
    "Effectivity", "Taxability", "Taxes Begin", "Status", "Paid Up To",
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[][] = [];
  for (const [muni, props] of grouped) {
    body.push([{
      content: `  ${muni.toUpperCase()}   ·   ${props.length} PROPERTIES`,
      colSpan: COLS.length,
      styles: {
        fillColor: [30, 41, 59],
        textColor: [203, 213, 225],
        fontStyle: "bold",
        fontSize: 7,
        cellPadding: { top: 3.5, bottom: 3.5, left: 6, right: 6 },
      },
    }]);
    for (const p of props) {
      body.push([
        p.tdNumber                                              ?? "",
        p.propertyIndexNo                                       ?? "",
        p.propertyLocation                                      ?? "",
        p.barangay                                              ?? "",
        p.lotBlockNo                                            ?? "",
        p.class                                                 ?? "",
        getPropertyTypeLabel(p.type),
        p.area != null ? Number(p.area).toLocaleString("en-PH") : "",
        fmtNum(p.marketValue),
        fmtNum(p.assessedValue),
        p.effectivity?.toString()                               ?? "",
        p.taxability                                            ?? "",
        formatQuarter(p.taxesBeginYear, p.taxesBeginQuarter),
        p.paymentStatus                                         ?? "",
        formatQuarter(p.paidUpToYear, p.paidUpToQuarter),
      ]);
    }
  }

  const totalMV = properties.reduce((s, p) => s + Number(p.marketValue   ?? 0), 0);
  const totalAV = properties.reduce((s, p) => s + Number(p.assessedValue ?? 0), 0);

  autoTable(doc, {
    head: [COLS],
    body,
    foot: [[
      { content: `TOTAL  ·  ${properties.length.toLocaleString()} records`, colSpan: 8,
        styles: { fontStyle: "bold", fillColor: [15,40,100], textColor: [255,255,255], halign: "right" } },
      { content: fmtNum(totalMV),
        styles: { fontStyle: "bold", fillColor: [15,40,100], textColor: [255,255,255], halign: "right" } },
      { content: fmtNum(totalAV),
        styles: { fontStyle: "bold", fillColor: [15,40,100], textColor: [255,255,255], halign: "right" } },
      { content: "", colSpan: 5, styles: { fillColor: [15,40,100] } },
    ]],
    startY: BAND + 2,
    showFoot: "lastPage",
    margin: { left: M, right: M, top: BAND + 2, bottom: 14 },
    styles: {
      fontSize: 6,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      overflow: "ellipsize",
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "center",
      fontSize: 6.5,
      cellPadding: { top: 3, bottom: 3, left: 2, right: 2 },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0:  { cellWidth: 16, halign: "center" },
      1:  { cellWidth: 24 },
      2:  { cellWidth: 34 },
      3:  { cellWidth: 20 },
      4:  { cellWidth: 14 },
      5:  { cellWidth:  9, halign: "center" },
      6:  { cellWidth: 13 },
      7:  { cellWidth: 14, halign: "right" },
      8:  { cellWidth: 22, halign: "right" },
      9:  { cellWidth: 22, halign: "right" },
      10: { cellWidth: 17, halign: "center" },
      11: { cellWidth: 17, halign: "center" },
      12: { cellWidth: 13, halign: "center" },
      13: { cellWidth: 18, halign: "center" },
      14: { cellWidth: 13, halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      if (!Array.isArray(data.row.raw)) return;
      const r0 = (data.row.raw as unknown[])[0];
      if (r0 && typeof r0 === "object" && "colSpan" in (r0 as Record<string, unknown>)) return;
      if (data.column.index === 13) {
        const c = STATUS_COLORS[data.cell.raw as string];
        if (c) {
          data.cell.styles.fillColor = c.fill;
          data.cell.styles.textColor = c.text;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    willDrawPage: () => { pageNum++; drawBanner(); },
    didDrawPage:  () => { drawFooter(); },
  });

  doc.save(filename);
}
