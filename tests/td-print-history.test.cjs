/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS test runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'td-print-history.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = new Module(sourcePath, module);
loaded.filename = sourcePath;
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
loaded._compile(compiled, sourcePath);
const { parseTdNumbers, validatePrintBatch, validateBatchNoteUpdate, MAX_BATCH_NOTE_LENGTH } = loaded.exports;

function rejected(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.equal(error instanceof Error, true);
    assert.match(error.message, pattern);
    return true;
  });
}

const tests = [
  ['parses twenty complete IDs while preserving final-group zeroes and order', () => {
    const endings = ['0053', '00278', '00151', '00276', '00132', '00133', '00128', '00547', '00081', '00563', '00559', '00083', '00064', '00030', '00187', '00001', '00069', '00169', '00031', '00017'];
    const text = `The **TD Numbers for NEW SAMBONG** are:\n${endings.map((ending, index) => `${index + 1}\\. &#x20;2023-05-0013-${ending}`).join('\n')}`;
    assert.deepEqual(parseTdNumbers(text), {
      tdNumbers: endings.map((ending) => `2023-05-0013-${ending}`),
      duplicateCount: 0,
      invalidLines: [],
    });
  }],
  ['accepts list prefixes, separators, entity encoded heading, and unicode dashes', () => {
    const result = parseTdNumbers('The **TD Numbers for NEW SAMBONG** are:\n1. 2023–05–0013–0053, 2023-05-0013-00278;\n• 2023-05-0013-00151');
    assert.deepEqual(result, {
      tdNumbers: ['2023-05-0013-0053', '2023-05-0013-00278', '2023-05-0013-00151'],
      duplicateCount: 0,
      invalidLines: [],
    });
    assert.deepEqual(parseTdNumbers('The &#x20;TD Numbers for NEW SAMBONG&#x20; are:\n2023-05-0013-0053').invalidLines, []);
    assert.deepEqual(parseTdNumbers('The &nbsp;**TD Numbers for NEW SAMBONG**&nbsp; are:\n2023-05-0013-0053').tdNumbers, ['2023-05-0013-0053']);
    assert.deepEqual(parseTdNumbers('The \\*\\*TD Numbers for NEW SAMBONG\\*\\* are:\n2023-05-0013-0053').invalidLines, []);
  }],
  ['counts duplicates in the same pasted batch and retains the first occurrence', () => {
    assert.deepEqual(parseTdNumbers('2023-05-0013-0053, 2023-05-0013-0053\n2023-05-0013-00278'), {
      tdNumbers: ['2023-05-0013-0053', '2023-05-0013-00278'],
      duplicateCount: 1,
      invalidLines: [],
    });
  }],
  ['reports malformed text even when a valid TD shares the line', () => {
    assert.deepEqual(parseTdNumbers('2023-05-0013-0053, 2023-05-0013-abc'), {
      tdNumbers: ['2023-05-0013-0053'],
      duplicateCount: 0,
      invalidLines: [{ line: 1, text: '2023-05-0013-0053, 2023-05-0013-abc' }],
    });
    for (const malformed of ['123-05-0013-0053', '2023-5-0013-0053', '2023-05-0013-0053-extra', 'x2023-05-0013-0053']) {
      assert.equal(parseTdNumbers(malformed).tdNumbers.length, 0);
      assert.equal(parseTdNumbers(malformed).invalidLines.length, 1);
    }
    assert.deepEqual(parseTdNumbers('bad, still-bad').invalidLines, [{ line: 1, text: 'bad, still-bad' }]);
  }],
  ['validates a trimmed location, calendar date, and parsed TD list', () => {
    assert.deepEqual(validatePrintBatch({
      location: '  NEW SAMBONG  ', printedOn: '2024-02-29', text: '2023-05-0013-0053\n2023-05-0013-00278',
    }), {
      location: 'NEW SAMBONG', printedOn: '2024-02-29',
      tdNumbers: ['2023-05-0013-0053', '2023-05-0013-00278'],
    });
    assert.deepEqual(validatePrintBatch({ location: 'New Sambong', printedOn: '2024-02-29', text: '2023-05-0013-0053' }).tdNumbers, ['2023-05-0013-0053']);
  }],
  ['rejects missing and wrongly typed fields, empty TDs, and malformed lines', () => {
    for (const body of [null, [], { printedOn: '2024-01-01', text: '2023-05-0013-0053' }, { location: 2, printedOn: '2024-01-01', text: '2023-05-0013-0053' }, { location: 'X', printedOn: '2024-01-01', text: '' }, { location: 'X', printedOn: '2024-01-01', text: '2023-05-0013-bad' }, { location: 'X', printedOn: '2024-01-01', text: 1 }, { location: 'X', printedOn: '2024-01-01', tdNumbers: ['2023-05-0013-0053'] }]) {
      rejected(() => validatePrintBatch(body), /.+/);
    }
  }],
  ['rejects invalid and rollover calendar dates', () => {
    for (const printedOn of ['2023-02-29', '2024-04-31', '2024-1-01', 'not-a-date', '0999-12-31']) {
      rejected(() => validatePrintBatch({ location: 'X', printedOn, text: '2023-05-0013-0053' }), /date/i);
    }
  }],
  ['enforces text, item, and location limits', () => {
    rejected(() => validatePrintBatch({ location: 'X', printedOn: '2024-01-01', text: 'x'.repeat(100001) }), /length|100000/i);
    const manyTds = Array.from({ length: 1001 }, (_, index) => `2023-05-0013-${String(index).padStart(4, '0')}`).join('\n');
    rejected(() => validatePrintBatch({ location: 'X', printedOn: '2024-01-01', text: manyTds }), /1000|limit|items/i);
    rejected(() => validatePrintBatch({ location: 'x'.repeat(256), printedOn: '2024-01-01', text: '2023-05-0013-0053' }), /location|255/i);
  }],
  ['allows reprinting an ID in a separate batch', () => {
    const body = { location: 'X', printedOn: '2024-01-01', text: '2023-05-0013-0053' };
    assert.deepEqual(validatePrintBatch(body).tdNumbers, ['2023-05-0013-0053']);
    assert.deepEqual(validatePrintBatch(body).tdNumbers, ['2023-05-0013-0053']);
  }],
  ['normalizes batch notes while preserving internal whitespace and plain text', () => {
    assert.deepEqual(validateBatchNoteUpdate({ note: '  Follow up\nwith  assessor.  ' }), {
      note: 'Follow up\nwith  assessor.',
    });
    assert.deepEqual(validateBatchNoteUpdate({ note: '<script>alert("note")</script>' }), {
      note: '<script>alert("note")</script>',
    });
    assert.deepEqual(validateBatchNoteUpdate({ note: '' }), { note: null });
    assert.deepEqual(validateBatchNoteUpdate({ note: ' \n\t ' }), { note: null });
  }],
  ['accepts only an object with one string note field', () => {
    for (const body of [null, [], 'note', {}, { note: null }, { note: 2 }, { note: true },
      { note: ['text'] }, { note: {} }, { note: 'text', location: 'Changed' }, { text: 'text' }]) {
      rejected(() => validateBatchNoteUpdate(body), /note/i);
    }
  }],
  ['enforces the 1000-character limit after trimming a batch note', () => {
    assert.equal(MAX_BATCH_NOTE_LENGTH, 1000);
    assert.deepEqual(validateBatchNoteUpdate({ note: `  ${'x'.repeat(1000)}\n` }), { note: 'x'.repeat(1000) });
    rejected(() => validateBatchNoteUpdate({ note: 'x'.repeat(1001) }), /1000/i);
  }],
];

let failures = 0;
for (const [name, run] of tests) {
  try {
    run();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stderr.write(`FAIL ${name}\n${error.stack}\n`);
  }
}
if (failures) process.exitCode = 1;
else process.stdout.write(`\n${tests.length} tests passed\n`);
