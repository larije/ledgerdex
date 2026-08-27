import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DelinquentAccount } from "@/types";
import {
  RPU_TYPE_LABELS,
  SETTLEMENT_STATUS_LABELS,
  SETTLEMENT_STATUS_COLORS,
  classCodeLabel,
  formatDelinquentPeriod,
} from "./delinquency";

const fmt = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        Number(v)
      );

const num = (v: number | null | undefined) => Number(v ?? 0);

// ── CSV ───────────────────────────────────────────────────────

const CSV_HEADERS = [
  "TD No.", "PIN", "Municipality", "Barangay", "Class", "RPU Type", "Area (sqm)",
  "Taxpayer", "Cadastral Lot", "Delinquent From", "Delinquent To",
  "Amount Due", "Amount Paid", "Balance", "Status",
];

export function exportDelinquentAccountsCSV(
  accounts: DelinquentAccount[],
  filename = "delinquent-accounts.csv"
) {
  const rows = accounts.map((a) => [
    a.tdNumber,
    a.pin ?? "",
    a.list?.municipality ?? "",
    a.barangay ?? "",
    a.classCode ?? "",
    RPU_TYPE_LABELS[a.rpuType] ?? a.rpuType,
    a.areaSqm != null ? String(num(a.areaSqm)) : "",
    a.taxpayerName,
    a.cadastralLotNo ?? "",
    formatDelinquentPeriod(a.delinquentFromYear, a.delinquentFromQuarter),
    formatDelinquentPeriod(a.delinquentToYear, a.delinquentToQuarter),
    num(a.amountDue).toFixed(2),
    num(a.amountPaid).toFixed(2),
    num(a.balance).toFixed(2),
    SETTLEMENT_STATUS_LABELS[a.status],
  ]);
  const csv = [CSV_HEADERS, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Consolidated Summary PDF ──────────────────────────────────

export function exportDelinquencySummaryPDF(
  accounts: DelinquentAccount[],
  filename = "delinquency-summary.pdf"
) {
  const doc = new jsPDF({ orientation: "landscape", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 10;
  const BAND = 26;
  let pageNum = 0;

  const drawBanner = () => {
    doc.setFillColor(120, 20, 20);
    doc.rect(0, 0, PW, BAND - 3, "F");
    doc.setFillColor(220, 38, 38);
    doc.rect(0, BAND - 3, PW, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text("DELINQUENT REAL PROPERTIES — ACCOUNTS NOT SETTLED", M, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Province of Davao del Norte  ·  RA 7160 §254  ·  LedgerDex", M, 18);
    const ts = new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
    doc.text(`Generated: ${ts}`, PW - M, 10, { align: "right" });
    doc.text(`${accounts.length.toLocaleString()} accounts  ·  Page ${pageNum}`, PW - M, 18, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };

  const drawFooter = () => {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(M, PH - 9, PW - M, PH - 9);
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text("LedgerDex  —  Delinquency Management", M, PH - 5.5);
    doc.text("CONFIDENTIAL  —  FOR OFFICIAL USE ONLY", PW - M, PH - 5.5, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };

  const grouped = new Map<string, DelinquentAccount[]>();
  for (const a of accounts) {
    const key = a.list?.municipality ?? "UNKNOWN";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(a);
  }

  const COLS = [
    "TD No.", "PIN", "Barangay", "Class", "RPU", "Area", "Taxpayer",
    "Cadastral", "Delinquent", "Amount Due", "Balance", "Status",
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any[][] = [];
  for (const [muni, accs] of grouped) {
    body.push([
      {
        content: `  ${muni.toUpperCase()}   ·   ${accs.length} ACCOUNTS`,
        colSpan: COLS.length,
        styles: {
          fillColor: [51, 65, 85],
          textColor: [226, 232, 240],
          fontStyle: "bold",
          fontSize: 7,
          cellPadding: { top: 3, bottom: 3, left: 6, right: 6 },
        },
      },
    ]);
    for (const a of accs) {
      body.push([
        a.tdNumber,
        a.pin ?? "",
        a.barangay ?? "",
        a.classCode ?? "",
        RPU_TYPE_LABELS[a.rpuType]?.slice(0, 5) ?? a.rpuType,
        a.areaSqm != null ? num(a.areaSqm).toLocaleString("en-PH") : "",
        a.taxpayerName,
        a.cadastralLotNo ?? "",
        formatDelinquentPeriod(
          a.delinquentFromYear,
          a.delinquentFromQuarter,
          a.delinquentToYear,
          a.delinquentToQuarter
        ),
        fmt(a.amountDue),
        fmt(a.balance),
        SETTLEMENT_STATUS_LABELS[a.status],
      ]);
    }
  }

  const totalDue = accounts.reduce((s, a) => s + num(a.amountDue), 0);
  const totalBal = accounts.reduce((s, a) => s + num(a.balance), 0);

  autoTable(doc, {
    head: [COLS],
    body,
    foot: [[
      { content: `TOTAL  ·  ${accounts.length.toLocaleString()} accounts`, colSpan: 9,
        styles: { fontStyle: "bold", fillColor: [120, 20, 20], textColor: [255, 255, 255], halign: "right" } },
      { content: fmt(totalDue), styles: { fontStyle: "bold", fillColor: [120, 20, 20], textColor: [255, 255, 255], halign: "right" } },
      { content: fmt(totalBal), styles: { fontStyle: "bold", fillColor: [120, 20, 20], textColor: [255, 255, 255], halign: "right" } },
      { content: "", styles: { fillColor: [120, 20, 20] } },
    ]],
    startY: BAND + 2,
    showFoot: "lastPage",
    margin: { left: M, right: M, top: BAND + 2, bottom: 14 },
    styles: { fontSize: 6, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, overflow: "ellipsize" },
    headStyles: { fillColor: [153, 27, 27], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 6.5 },
    alternateRowStyles: { fillColor: [250, 250, 252] },
    columnStyles: {
      0: { cellWidth: 26 }, 1: { cellWidth: 28 }, 2: { cellWidth: 22 },
      3: { cellWidth: 9, halign: "center" }, 4: { cellWidth: 12 },
      5: { cellWidth: 14, halign: "right" }, 6: { cellWidth: 46 },
      7: { cellWidth: 20 }, 8: { cellWidth: 26, halign: "center" },
      9: { cellWidth: 22, halign: "right" }, 10: { cellWidth: 22, halign: "right" },
      11: { cellWidth: 20, halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section !== "body" || !Array.isArray(data.row.raw)) return;
      const r0 = (data.row.raw as unknown[])[0];
      if (r0 && typeof r0 === "object" && "colSpan" in (r0 as Record<string, unknown>)) return;
      if (data.column.index === 11) {
        const label = data.cell.raw as string;
        const key = (Object.keys(SETTLEMENT_STATUS_LABELS) as (keyof typeof SETTLEMENT_STATUS_LABELS)[])
          .find((k) => SETTLEMENT_STATUS_LABELS[k] === label);
        if (key) {
          const c = SETTLEMENT_STATUS_COLORS[key];
          data.cell.styles.fillColor = c.fill;
          data.cell.styles.textColor = c.text;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    willDrawPage: () => { pageNum++; drawBanner(); },
    didDrawPage: () => { drawFooter(); },
  });

  doc.save(filename);
}

// ── Per-taxpayer Notice (RA 7160 §254) ────────────────────────

function drawNotice(doc: jsPDF, taxpayer: string, accounts: DelinquentAccount[], first: boolean) {
  if (!first) doc.addPage();
  const PW = doc.internal.pageSize.getWidth();
  const M = 18;
  const province = "Davao del Norte";
  const municipality = accounts[0]?.list?.municipality ?? "";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text("Republic of the Philippines", PW / 2, 18, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text(`Province of ${province}`, PW / 2, 24, { align: "center" });
  doc.text(`MUNICIPALITY OF ${municipality.toUpperCase()}`, PW / 2, 30, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("Office of the Municipal Treasurer", PW / 2, 35.5, { align: "center" });

  doc.setDrawColor(120, 20, 20);
  doc.setLineWidth(0.6);
  doc.line(M, 40, PW - M, 40);

  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text(today, M, 52);

  doc.setFont("helvetica", "bold");
  doc.text(taxpayer, M, 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(`${municipality}, ${province}`, M, 67.5);

  doc.setTextColor(20, 20, 20);
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.text("NOTICE OF TAX DELINQUENCY", PW / 2, 80, { align: "center" });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.text("(Pursuant to Section 254, R.A. 7160 — Local Government Code of 1991)", PW / 2, 85, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const intro =
    `Please be informed that, per the records of this Office, the following real ` +
    `property/ies registered under your name is/are delinquent in the payment of ` +
    `real property taxes. You are hereby requested to settle the total amount due ` +
    `to avoid the remedies provided under the law.`;
  const lines = doc.splitTextToSize(intro, PW - M * 2);
  doc.text(lines, M, 95);

  const total = accounts.reduce((s, a) => s + num(a.balance), 0);
  autoTable(doc, {
    startY: 95 + lines.length * 5 + 3,
    head: [["TD No.", "Barangay", "Cadastral Lot", "Class", "Delinquent Period", "Amount Due"]],
    body: accounts.map((a) => [
      a.tdNumber,
      a.barangay ?? "",
      a.cadastralLotNo ?? "",
      classCodeLabel(a.classCode),
      formatDelinquentPeriod(a.delinquentFromYear, a.delinquentFromQuarter, a.delinquentToYear, a.delinquentToQuarter),
      fmt(a.balance),
    ]),
    foot: [[
      { content: "TOTAL AMOUNT DUE", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
      { content: fmt(total), styles: { halign: "right", fontStyle: "bold" } },
    ]],
    margin: { left: M, right: M },
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: [153, 27, 27], textColor: [255, 255, 255], fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], textColor: [20, 20, 20] },
    columnStyles: { 5: { halign: "right" } },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const endY = (doc as any).lastAutoTable?.finalY ?? 160;
  doc.setFontSize(9.5);
  doc.text("Very truly yours,", M, endY + 18);
  doc.setFont("helvetica", "bold");
  doc.text("The Municipal Treasurer", M, endY + 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    "This is a computer-generated notice from LedgerDex. FOR OFFICIAL USE ONLY.",
    M,
    doc.internal.pageSize.getHeight() - 12
  );
  doc.setTextColor(20, 20, 20);
}

export function generateTaxpayerNoticePDF(
  taxpayer: string,
  accounts: DelinquentAccount[],
  filename?: string
) {
  const doc = new jsPDF({ orientation: "portrait", format: "a4" });
  drawNotice(doc, taxpayer, accounts, true);
  doc.save(filename ?? `notice-${taxpayer.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`);
}

/** One letter per distinct taxpayer, concatenated into a single PDF. */
export function generateBatchNoticesPDF(accounts: DelinquentAccount[], filename = "delinquency-notices.pdf") {
  const byTaxpayer = new Map<string, DelinquentAccount[]>();
  for (const a of accounts) {
    const key = a.taxpayerName || "—";
    if (!byTaxpayer.has(key)) byTaxpayer.set(key, []);
    byTaxpayer.get(key)!.push(a);
  }
  const doc = new jsPDF({ orientation: "portrait", format: "a4" });
  let first = true;
  for (const [taxpayer, accs] of byTaxpayer) {
    drawNotice(doc, taxpayer, accs, first);
    first = false;
  }
  doc.save(filename);
}
