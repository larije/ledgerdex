export const MAX_TD_TEXT_LENGTH = 100_000;
export const MAX_TD_NUMBERS = 1_000;
export const MAX_LOCATION_LENGTH = 255;
export const MAX_BATCH_NOTE_LENGTH = 1_000;

export type InvalidTdLine = { line: number; text: string };
export type ParsedTdNumbers = {
  tdNumbers: string[];
  duplicateCount: number;
  invalidLines: InvalidTdLine[];
};

const TD_NUMBER_PATTERN = /^\d{4}-\d{2}-\d{4}-\d{1,10}$/;

function decodeSpaceEntities(value: string): string {
  return value
    .replace(/&#x0*20;?/gi, ' ')
    .replace(/&#0*32;?/g, ' ')
    .replace(/&nbsp;/gi, ' ');
}

function normalizeHeading(line: string): string {
  return decodeSpaceEntities(line)
    .replace(/\\([*_`])/g, '$1')
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/[*_`]/g, '')
    .trim();
}

function isTdHeading(line: string): boolean {
  return /^the\s+td\s+numbers\s+for\s+.+\s+are\s*:?$/i.test(normalizeHeading(line));
}

function removeListMarker(line: string): string {
  return line
    .replace(/^\s*\d{1,4}\\?[.)]\s+/, '')
    .replace(/^\s*[-*+•‣▪◦]\s+/, '')
    .trim();
}

export function parseTdNumbers(text: string): ParsedTdNumbers {
  if (typeof text !== 'string') {
    throw new Error('TD text must be a string.');
  }

  const tdNumbers: string[] = [];
  const seen = new Set<string>();
  const invalidLines: InvalidTdLine[] = [];
  let duplicateCount = 0;
  const normalized = decodeSpaceEntities(text).replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');

  normalized.split(/\r?\n/).forEach((originalLine, index) => {
    if (!originalLine.trim() || isTdHeading(originalLine)) return;

    const line = removeListMarker(originalLine);
    if (!line) return;
    const tokens = line.split(/[\s,;]+/).filter(Boolean);
    let hasInvalidToken = false;
    for (const token of tokens) {
      if (TD_NUMBER_PATTERN.test(token)) {
        if (seen.has(token)) duplicateCount += 1;
        else {
          seen.add(token);
          tdNumbers.push(token);
        }
      } else {
        hasInvalidToken = true;
      }
    }
    if (hasInvalidToken) invalidLines.push({ line: index + 1, text: originalLine });
  });

  return { tdNumbers, duplicateCount, invalidLines };
}

export type ValidatedPrintBatch = {
  location: string;
  printedOn: string;
  tdNumbers: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateBatchNoteUpdate(body: unknown): { note: string | null } {
  if (!isRecord(body) || Object.keys(body).length !== 1 || typeof body.note !== 'string') {
    throw new Error('Provide only a note string.');
  }

  const note = body.note.trim();
  if (note.length > MAX_BATCH_NOTE_LENGTH) {
    throw new Error(`Note must be at most ${MAX_BATCH_NOTE_LENGTH} characters.`);
  }

  return { note: note || null };
}

function validatePrintedOn(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Printed date must use YYYY-MM-DD format.');
  }

  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000) throw new Error('Printed date year must be between 1000 and 9999.');
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > (daysInMonth[month - 1] ?? 0)) {
    throw new Error('Printed date must be a valid calendar date.');
  }
  return value;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function validatePrintBatch(body: unknown): ValidatedPrintBatch {
  if (!isRecord(body)) throw new Error('Print batch must be an object.');

  if (typeof body.location !== 'string') throw new Error('Location is required and must be a string.');
  const location = body.location.trim();
  if (!location) throw new Error('Location is required.');
  if (location.length > MAX_LOCATION_LENGTH) {
    throw new Error(`Location must be at most ${MAX_LOCATION_LENGTH} characters.`);
  }

  const printedOn = validatePrintedOn(body.printedOn);
  if (typeof body.text !== 'string') throw new Error('TD text is required and must be a string.');
  const tdText = body.text;
  if (tdText.length > MAX_TD_TEXT_LENGTH) {
    throw new Error(`TD text must be at most ${MAX_TD_TEXT_LENGTH} characters.`);
  }

  const parsed = parseTdNumbers(tdText);
  if (parsed.invalidLines.length) {
    const first = parsed.invalidLines[0];
    throw new Error(`Invalid TD text on line ${first.line}: ${first.text}`);
  }
  if (!parsed.tdNumbers.length) throw new Error('At least one TD number is required.');
  if (parsed.tdNumbers.length > MAX_TD_NUMBERS) {
    throw new Error(`A batch can contain at most ${MAX_TD_NUMBERS} TD numbers.`);
  }

  return { location, printedOn, tdNumbers: parsed.tdNumbers };
}
