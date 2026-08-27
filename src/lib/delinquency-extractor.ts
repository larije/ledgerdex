import {
  ParsedDelinquencyDoc,
  ParsedDelinquentRow,
  ParsedRowError,
  RpuType,
} from "@/types";

/**
 * Parser for the "Consolidated Summary of All Delinquent Real Properties Whose
 * Accounts Were Not Settled" PDF (RA 7160 §254), e.g. KAPALONG.pdf.
 *
 * Different layout from lib/pdf-extractor.ts (RPTOP tax-declaration lists):
 *   NO. · TD NO. · PIN · BARANGAY · CLASS CODE · RPU TYPE · AREA (SQM.) ·
 *   TAXPAYER NAME · CADASTRAL LOT NO. · START YEAR-QTR · END YEAR-QTR · TOTAL
 *
 * Technique (same family as the existing extractor): pdfjs text items → group
 * into visual lines by Y → build an X-coordinate column map from the header →
 * stitch multi-line rows (long taxpayer names wrap) anchored on the TD number →
 * read each cell by X-band.
 */

interface TextItem {
  str: string;
  x: number; // left edge
  y: number; // top-origin (0 = top of page)
  c: number; // horizontal center (x + width/2) — used for column bucketing
}

interface Line {
  y: number;
  items: TextItem[];
}

const Y_TOL = 3.2; // px tolerance for grouping items into one visual line

// A TD number: 4-digit year, then -DD-DDDD-<rest>. Distinct from a PIN, which
// starts with a 3-digit barangay-ish code (e.g. 063-04-...).
const TD_RE = /(?:19|20)\d{2}-\d{2}-\d{4}-\d{2,}[A-Za-z0-9()\-]*/;

const PERIOD_RE = /(\d{4})\s*-?\s*Q\s*([1-4])/i;

// ── Small parse helpers ───────────────────────────────────────

function toNumber(str: string | null | undefined): number | null {
  if (!str) return null;
  const cleaned = str.replace(/[,\s₱]/g, "");
  if (!/[0-9]/.test(cleaned)) return null;
  const v = parseFloat(cleaned);
  return Number.isFinite(v) ? v : null;
}

function parseRpuType(s: string): RpuType {
  const t = (s ?? "").toLowerCase();
  if (t.includes("plant") || t.includes("tree")) return "PLANTTREE";
  if (t.includes("land")) return "LAND";
  if (t.includes("bldg") || t.includes("build")) return "BLDG";
  if (t.includes("mach")) return "MACH";
  return "MISC";
}

function parsePeriod(s: string): { year: number | null; quarter: number | null } {
  const m = (s ?? "").match(PERIOD_RE);
  if (!m) return { year: null, quarter: null };
  return { year: parseInt(m[1], 10), quarter: parseInt(m[2], 10) };
}

function parseClassCode(s: string): string | null {
  const m = (s ?? "").trim().toUpperCase().match(/[A-Z]/);
  return m ? m[0] : null;
}

// ── Line grouping ─────────────────────────────────────────────

function groupLines(items: TextItem[]): Line[] {
  const lines: Line[] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const existing = lines.find((l) => Math.abs(l.y - item.y) <= Y_TOL);
    if (existing) existing.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  // top-origin: ascending y = top-to-bottom reading order
  lines.sort((a, b) => a.y - b.y);
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

// ── Header / column map ───────────────────────────────────────

type ColKey =
  | "rowNo"
  | "tdNumber"
  | "pin"
  | "barangay"
  | "classCode"
  | "rpuType"
  | "area"
  | "taxpayer"
  | "cadastral"
  | "start"
  | "end"
  | "total";

type ColumnMap = Partial<Record<ColKey, number>>;

const HEADER_HINTS = ["TD", "PIN", "BARANGAY", "TAXPAYER", "TOTAL", "AREA"];

function isHeaderLine(line: Line): boolean {
  const text = line.items.map((i) => i.str.toUpperCase()).join(" ");
  const hits = HEADER_HINTS.filter((k) => text.includes(k)).length;
  return hits >= 4;
}

function isNoiseLine(line: Line): boolean {
  const t = line.items.map((i) => i.str).join(" ").trim();
  return (
    /page\s+\d+\s+of\s+\d+/i.test(t) ||
    /municipality of/i.test(t) ||
    /republic of the philippines/i.test(t) ||
    /province of/i.test(t) ||
    /consolidated summary/i.test(t) ||
    /certified correct/i.test(t) ||
    /municipal treasurer/i.test(t) ||
    /in compliance/i.test(t) ||
    /section\s*254/i.test(t)
  );
}

/** Assign X positions to columns from one (already merged) header line. */
function buildColumnMap(headerItems: TextItem[]): ColumnMap | null {
  const map: ColumnMap = {};
  // Column positions and cell bucketing use each item's horizontal CENTER, not
  // its left edge: header labels are centered over their column while data (esp.
  // long taxpayer names) is left-aligned, so left-edge boundaries misfile the
  // leftmost text into the previous column. Centers line up reliably.
  const sorted = [...headerItems].sort((a, b) => a.c - b.c);
  for (const it of sorted) {
    const t = it.str.toUpperCase().trim();
    const x = it.c;
    if (t.includes("TAXPAYER")) map.taxpayer ??= x;
    else if (t.includes("CADASTRAL") || t.includes("LOT")) map.cadastral ??= x;
    else if (t.includes("BARANGAY")) map.barangay ??= x;
    else if (t.includes("CLASS")) map.classCode ??= x;
    else if (t.includes("RPU")) map.rpuType ??= x;
    else if (t.includes("AREA") || t.includes("SQM")) map.area ??= x;
    else if (t.includes("TOTAL")) map.total ??= x;
    else if (t.includes("PIN")) map.pin ??= x;
    else if (t.includes("START")) map.start ??= x;
    else if (t.includes("END")) map.end ??= x;
    else if (t.includes("TYPE")) map.rpuType ??= x; // fallback if "RPU" split off
    else if (t === "NO." || t === "NO") map.rowNo ??= x; // leftmost "NO." column
    else if (t.includes("TD")) map.tdNumber ??= x;
  }
  // Minimum columns needed to make sense of a row.
  if (
    map.tdNumber == null ||
    map.taxpayer == null ||
    map.total == null ||
    map.cadastral == null
  ) {
    return null;
  }
  return map;
}

/** Ordered [key,x] pairs left→right, plus computed left boundaries per column. */
function columnBounds(map: ColumnMap): { key: ColKey; x: number; left: number }[] {
  const cols = (Object.entries(map) as [ColKey, number][])
    .filter(([, x]) => x != null)
    .sort((a, b) => a[1] - b[1]);

  return cols.map(([key, x], i) => {
    let left: number;
    if (i === 0) {
      // Mirror the gap to the next column so the row-number cell is excluded.
      const next = cols[1]?.[1];
      left = next != null ? x - (next - x) / 2 : x - 30;
    } else {
      left = (cols[i - 1][1] + x) / 2; // midpoint with previous column
    }
    return { key, x, left };
  });
}

function cellText(items: TextItem[], lo: number, hi: number): string {
  return items
    .filter((it) => it.c >= lo && it.c < hi)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((i) => i.str.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Row extraction ────────────────────────────────────────────

function extractRow(
  items: TextItem[],
  bounds: { key: ColKey; x: number; left: number }[]
): ParsedDelinquentRow | null {
  const get = (key: ColKey): string => {
    const idx = bounds.findIndex((b) => b.key === key);
    if (idx < 0) return "";
    const lo = bounds[idx].left;
    const hi = idx + 1 < bounds.length ? bounds[idx + 1].left : Infinity;
    return cellText(items, lo, hi);
  };

  const tdRaw = get("tdNumber");
  const tdMatch = tdRaw.match(TD_RE);
  const tdNumber = tdMatch ? tdMatch[0] : tdRaw.trim();
  if (!tdNumber) return null;

  // Row number: prefer a dedicated "NO." column; else the digits before the TD
  // number in the TD cell; else anything left of the first column boundary.
  const rowNoRaw =
    get("rowNo") ||
    (tdMatch ? tdRaw.slice(0, tdMatch.index ?? 0) : "") ||
    cellText(items, -Infinity, bounds[0].left);
  const rowNoMatch = rowNoRaw.match(/\d+/);
  const rowNo = rowNoMatch ? parseInt(rowNoMatch[0], 10) : null;

  const bandItems = (key: ColKey): TextItem[] => {
    const idx = bounds.findIndex((b) => b.key === key);
    if (idx < 0) return [];
    const lo = bounds[idx].left;
    const hi = idx + 1 < bounds.length ? bounds[idx + 1].left : Infinity;
    return items.filter((it) => it.c >= lo && it.c < hi);
  };
  // Taxpayer = its own band + any alphabetic text that leaked into the numeric
  // AREA band (short names / wrapped-name fragments centered just left of the
  // boundary). Area itself is parsed numerically so the leaked text is ignored.
  const taxpayerName = [
    ...bandItems("taxpayer"),
    ...bandItems("area").filter((it) => /[A-Za-z]/.test(it.str)),
  ]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((i) => i.str.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const from = parsePeriod(get("start"));
  const to = parsePeriod(get("end"));
  const amountDue = toNumber(get("total"));
  if (amountDue == null) return null; // amount is required to be a useful record

  return {
    rowNo: Number.isFinite(rowNo as number) ? rowNo : null,
    tdNumber,
    pin: get("pin") || null,
    barangay: get("barangay") || null,
    classCode: parseClassCode(get("classCode")),
    rpuType: parseRpuType(get("rpuType")),
    areaSqm: toNumber(get("area")),
    taxpayerName,
    cadastralLotNo: get("cadastral") || null,
    delinquentFromYear: from.year,
    delinquentFromQuarter: from.quarter,
    delinquentToYear: to.year,
    delinquentToQuarter: to.quarter,
    amountDue,
  };
}

// ── Metadata ──────────────────────────────────────────────────

function extractMeta(allText: string): {
  province: string;
  municipality: string;
  asOfDate: string | null;
  title: string | null;
} {
  const prov = allText.match(/Province of\s+([A-Za-z .'-]+?)(?:\s{2,}|CONSOLIDATED|In compliance|$)/i);
  const muni = allText.match(/MUNICIPALITY OF\s+([A-Z .'-]+?)(?:\s{2,}|NO\.|Page|$)/i);
  const asOf = allText.match(/as of\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);

  let asOfDate: string | null = null;
  if (asOf) {
    const d = new Date(asOf[1].replace(",", ""));
    if (!Number.isNaN(d.getTime())) asOfDate = d.toISOString();
  }

  const title = allText.match(
    /(CONSOLIDATED SUMMARY[\s\S]{0,120}?NOT SETTLED)/i
  );

  return {
    province: prov ? prov[1].trim() : "Davao del Norte",
    municipality: muni ? muni[1].trim() : "",
    asOfDate,
    title: title ? title[1].replace(/\s+/g, " ").trim() : null,
  };
}

// ── Public entrypoint ─────────────────────────────────────────

export async function extractDelinquencyPDF(
  buffer: Buffer
): Promise<ParsedDelinquencyDoc> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const rows: ParsedDelinquentRow[] = [];
  const rowErrors: ParsedRowError[] = [];
  let columnMap: ColumnMap | null = null;
  let firstPageText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items: TextItem[] = (content.items as unknown[])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((it: any) => typeof it.str === "string")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((it: any) => ({
        str: it.str as string,
        x: it.transform[4] as number,
        y: viewport.height - (it.transform[5] as number),
        c: (it.transform[4] as number) + ((it.width as number) || 0) / 2,
      }));

    if (pageNum === 1) firstPageText = items.map((i) => i.str).join(" ");

    const lines = groupLines(items);

    // Build the column map from the (possibly two-line) header, once.
    if (!columnMap) {
      for (let i = 0; i < lines.length; i++) {
        if (!isHeaderLine(lines[i])) continue;
        // Merge neighbouring non-data lines to capture wrapped header labels.
        const merged = [lines[i - 1], lines[i], lines[i + 1]]
          .filter((l): l is Line => !!l && (l === lines[i] || (!isDataLine(l) && !isNoiseLine(l))))
          .flatMap((l) => l.items);
        const map = buildColumnMap(merged);
        if (map) {
          columnMap = map;
          break;
        }
      }
    }
    if (!columnMap) continue;

    const bounds = columnBounds(columnMap);

    // Group lines into logical rows by vertical GAP. Lines belonging to one row
    // (a wrapped taxpayer name, the row number, the data line) sit ~half the row
    // pitch apart, while adjacent rows are a full pitch apart. Cluster on a
    // threshold of 75% of the median line spacing, so a wrapped name is captured
    // with its row whether the extra line is above or below the data line —
    // nearest-anchor fails because a wrapped line can be closer to the row above.
    const contentLines = lines.filter((l) => {
      // A line containing a TD number is ALWAYS a data row — never drop it as
      // noise/header, even when the taxpayer is a government owner whose name
      // matches a header/footer phrase ("REPUBLIC OF THE PHILIPPINES",
      // "PROVINCE OF DAVAO DEL NORTE", etc.).
      if (TD_RE.test(l.items.map((i) => i.str).join(" "))) return true;
      return !isNoiseLine(l) && !isHeaderLine(l);
    });
    const gaps: number[] = [];
    for (let i = 1; i < contentLines.length; i++) {
      gaps.push(contentLines[i].y - contentLines[i - 1].y);
    }
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const medianGap = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : 13;
    const threshold = medianGap * 0.75;

    const clusters: TextItem[][] = [];
    let current: TextItem[] = [];
    for (let i = 0; i < contentLines.length; i++) {
      if (i > 0 && current.length && contentLines[i].y - contentLines[i - 1].y > threshold) {
        clusters.push(current);
        current = [];
      }
      current.push(...contentLines[i].items);
    }
    if (current.length) clusters.push(current);

    for (const rowItems of clusters) {
      if (!TD_RE.test(rowItems.map((i) => i.str).join(" "))) continue; // no TD anchor
      try {
        const parsed = extractRow(rowItems, bounds);
        if (parsed && parsed.tdNumber) rows.push(parsed);
        else
          rowErrors.push({
            rowNo: null,
            raw: rowItems.map((i) => i.str).join(" ").slice(0, 200),
            reason: "Missing TD number or amount",
          });
      } catch (e) {
        rowErrors.push({
          rowNo: null,
          raw: rowItems.map((i) => i.str).join(" ").slice(0, 200),
          reason: e instanceof Error ? e.message : "parse error",
        });
      }
    }
  }

  const meta = extractMeta(firstPageText);
  return { ...meta, rows, rowErrors };
}

function isDataLine(line: Line): boolean {
  const text = line.items.map((i) => i.str).join(" ");
  return TD_RE.test(text);
}
