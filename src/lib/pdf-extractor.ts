import { ExtractedRow } from "@/types";

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TextRow {
  y: number;
  items: TextItem[];
}

// Column header keywords to detect the table header row
const HEADER_KEYWORDS = [
  "ARP/TD", "PROPERTY INDEX", "LOCATION", "LOT", "CLASS",
  "TYPE", "AREA", "MARKET VALUE", "ASSESSED VALUE",
  "EFFECTIVITY", "TAXABILITY", "TAXES BEGIN",
];

const Y_TOLERANCE = 4; // px tolerance for grouping text into rows

function groupIntoRows(items: TextItem[]): TextRow[] {
  const rows: TextRow[] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const existing = rows.find((r) => Math.abs(r.y - item.y) <= Y_TOLERANCE);
    if (existing) {
      existing.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }
  return rows.sort((a, b) => b.y - a.y); // PDF coords: top has higher y
}

function isHeaderRow(row: TextRow): boolean {
  const text = row.items.map((i) => i.str.toUpperCase()).join(" ");
  const hits = HEADER_KEYWORDS.filter((k) => text.includes(k));
  return hits.length >= 4;
}

function isDataRow(row: TextRow): boolean {
  const text = row.items.map((i) => i.str).join(" ");
  // ARP/TD format: 2023-XX-XXXX-XXXXX or similar
  return /20\d{2}-\d{2}-\d{4}-\d{2,}/.test(text);
}

interface ColumnMap {
  tdNumber: number;
  propertyIndexNo: number;
  propertyLocation: number;
  lotBlockNo: number;
  class: number;
  type: number;
  area: number;
  marketValue: number;
  assessedValue: number;
  effectivity: number;
  taxability: number;
  taxesBegin: number;
}

function buildColumnMap(headerRow: TextRow): ColumnMap | null {
  const sorted = [...headerRow.items].sort((a, b) => a.x - b.x);
  const map: Partial<ColumnMap> = {};

  for (const item of sorted) {
    const text = item.str.toUpperCase().trim();
    const x = item.x;
    // ??= so the first match wins — prevents split header lines from overwriting
    if      (text.includes("ARP") || text.includes("TD NO"))     { map.tdNumber        ??= x; }
    else if (text.includes("INDEX"))                              { map.propertyIndexNo ??= x; }
    else if (text === "PROPERTY")                                 { map.propertyIndexNo ??= x; } // "PROPERTY" / "INDEX NO." split header
    else if (text.includes("LOCATION"))                          { map.propertyLocation ??= x; }
    else if (text.includes("LOT") || text.includes("BLOCK"))     { map.lotBlockNo       ??= x; }
    else if (text.includes("CLASS"))                             { map.class            ??= x; }
    else if (text.includes("TYPE"))                              { map.type             ??= x; }
    else if (text.includes("AREA") || text.includes("SQM"))     { map.area             ??= x; }
    else if (text.includes("MARKET"))                           { map.marketValue       ??= x; }
    else if (text.includes("ASSESSED"))                         { map.assessedValue     ??= x; }
    else if (text.includes("EFFECTIVITY"))                       { map.effectivity      ??= x; }
    else if (text.includes("TAXAB"))                             { map.taxability       ??= x; }
    else if (text.includes("TAXES") || text.includes("BEGIN"))  { map.taxesBegin       ??= x; }
  }

  // tdNumber and assessedValue are the minimum required to produce useful data
  if (map.tdNumber == null || map.assessedValue == null) {
    return null;
  }
  return map as ColumnMap;
}

function getCell(row: TextRow, colX: number, nextColX?: number): string {
  const margin = 15;
  const items = row.items
    .filter((item) => {
      const inStart = item.x >= colX - margin;
      const inEnd = nextColX == null || item.x < nextColX - margin;
      return inStart && inEnd;
    })
    .sort((a, b) => a.x - b.x);
  return items.map((i) => i.str.trim()).join(" ").trim();
}

function getColOrder(colMap: ColumnMap): Array<{ key: keyof ColumnMap; x: number }> {
  return (Object.entries(colMap) as Array<[string, number]>)
    .map(([key, x]) => ({ key: key as keyof ColumnMap, x }))
    .sort((a, b) => a.x - b.x);
}

function extractRowData(row: TextRow, colMap: ColumnMap): ExtractedRow {
  const ordered = getColOrder(colMap);

  const getVal = (key: keyof ColumnMap): string => {
    const idx = ordered.findIndex((c) => c.key === key);
    const colX = ordered[idx]?.x;
    const nextX = ordered[idx + 1]?.x;
    if (colX == null) return "";
    return getCell(row, colX, nextX);
  };

  const location = getVal("propertyLocation");
  // Try to split barangay from municipality (format: "BARANGAY, MUNICIPALITY")
  const locationParts = location.split(",").map((s) => s.trim());
  const barangay = locationParts[0] ?? "";
  const municipality = locationParts.slice(1).join(", ").trim() || "";

  // In many Philippine RPTOP PDFs, the Property Index No. (PIN) is concatenated
  // in the same cell as the TD Number rather than in a separate column.
  // Extract the TD number (starts with year YYYY-) then take the remainder as PIN.
  const tdRaw = getVal("tdNumber");
  const tdMatch = tdRaw.match(/20\d{2}-\d{2}-\d{4}-\d{2,}/);
  const tdNumber = tdMatch ? tdMatch[0] : tdRaw.trim();
  const afterTd = tdMatch
    ? tdRaw.slice((tdMatch.index ?? 0) + tdMatch[0].length).replace(/^[.\s]+/, "").trim()
    : "";
  const propertyIndexNoFromTd = afterTd;
  const propertyIndexNo = getVal("propertyIndexNo") || propertyIndexNoFromTd;

  return {
    tdNumber,
    propertyIndexNo,
    propertyLocation: location,
    barangay,
    municipality,
    lotBlockNo: getVal("lotBlockNo"),
    class: getVal("class"),
    type: getVal("type"),
    area: getVal("area"),
    marketValue: getVal("marketValue"),
    assessedValue: getVal("assessedValue"),
    effectivity: getVal("effectivity"),
    taxability: getVal("taxability"),
    taxesBegin: getVal("taxesBegin"),
  };
}

export async function extractFromPDFBuffer(buffer: Buffer): Promise<{
  rows: ExtractedRow[];
  taxpayerName: string;
  taxpayerAddress: string;
  noaCount: string;
  assessmentYear: number | null;
  municipality: string;
}> {
  // Dynamically import pdfjs to avoid SSR issues
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const allRows: ExtractedRow[] = [];
  let taxpayerName = "";
  let taxpayerAddress = "";
  let noaCount = "";
  let assessmentYear: number | null = null;
  let municipality = "";
  let colMap: ColumnMap | null = null;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: TextItem[] = (textContent.items as any[])
      .filter((item) => typeof item.str === "string")
      .map((item) => ({
        str: item.str as string,
        x: item.transform[4] as number,
        y: viewport.height - (item.transform[5] as number),
        width: item.transform[0] as number,
        height: Math.abs(item.transform[3] as number),
      }));

    const rows = groupIntoRows(items);

    // On page 1, extract header metadata
    if (pageNum === 1) {
      const allText = items.map((i) => i.str).join(" ");

      // NOA Count
      const noaMatch = allText.match(/NOA\s*COUNT\s*[:\s]*([0-9-]+)/i);
      if (noaMatch) noaCount = noaMatch[1].trim();

      // Year
      const yearMatch = allText.match(/year\s+(\d{4})/i);
      if (yearMatch) assessmentYear = parseInt(yearMatch[1]);

      // Taxpayer name — appears after "Taxpayer" label
      const taxpayerIdx = items.findIndex((i) => /taxpayer/i.test(i.str));
      if (taxpayerIdx >= 0) {
        const nameItems = items
          .filter((i) => i.y >= items[taxpayerIdx].y - 5 && i.y <= items[taxpayerIdx].y + 5 && i.x > items[taxpayerIdx].x)
          .sort((a, b) => a.x - b.x);
        taxpayerName = nameItems.map((i) => i.str.trim()).join(" ").replace(/^[:]\s*/, "").trim();
      }

      // Address — 1-2 rows below taxpayer
      if (taxpayerIdx >= 0) {
        const taxY = items[taxpayerIdx].y;
        const addrItems = items.filter((i) => i.y > taxY + 8 && i.y < taxY + 40);
        taxpayerAddress = addrItems.map((i) => i.str.trim()).join(" ").trim();
      }
    }

    // Find column map — rows are sorted bottom-to-top (descending y), so the
    // second header line (e.g. "INDEX NO.", "BEGIN") sits at r-1; check both
    // neighbors so multi-line column headers are merged regardless of sort direction.
    for (let r = 0; r < rows.length; r++) {
      if (!colMap && isHeaderRow(rows[r])) {
        const candidates = [rows[r - 1], rows[r + 1]].filter(
          (row): row is TextRow => !!row && !isDataRow(row) && !isHeaderRow(row)
        );
        const extraItems = candidates.flatMap((row) => row.items);
        const mergedItems = extraItems.length > 0
          ? [...rows[r].items, ...extraItems]
          : rows[r].items;
        colMap = buildColumnMap({ y: rows[r].y, items: mergedItems });
      }
    }

    // Extract data rows
    for (const row of rows) {
      if (colMap && isDataRow(row)) {
        const extracted = extractRowData(row, colMap);
        if (extracted.tdNumber) {
          allRows.push(extracted);
          if (!municipality && extracted.municipality) {
            municipality = extracted.municipality;
          }
        }
      }
    }
  }

  return { rows: allRows, taxpayerName, taxpayerAddress, noaCount, assessmentYear, municipality };
}

export function parseNumeric(str: string): number | null {
  if (!str) return null;
  const cleaned = str.replace(/[,\s]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

export function parsePropertyType(str: string): "LAND" | "BLDG" | "MACH" | "MISC" {
  const upper = (str ?? "").toUpperCase().trim();
  if (upper === "LAND") return "LAND";
  if (upper === "BLDG" || upper === "BUILDING") return "BLDG";
  if (upper === "MACH" || upper === "MACHINERY") return "MACH";
  return "MISC";
}

export function parseTaxability(str: string): "TAXABLE" | "EXEMPT" {
  return (str ?? "").toUpperCase().includes("EXEMPT") ? "EXEMPT" : "TAXABLE";
}
