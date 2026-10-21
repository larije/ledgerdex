/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS test runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'theme.ts');
assert.ok(fs.existsSync(sourcePath), 'Theme storage helpers must exist.');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function loadTheme(saved = null, { failRead = false, failWrite = false, failAccess = false } = {}) {
  let stored = saved;
  const writes = [];
  const storage = {
    getItem(key) {
      assert.equal(key, 'theme');
      if (failRead) throw new Error('Storage read blocked');
      return stored;
    },
    setItem(key, value) {
      assert.equal(key, 'theme');
      if (failWrite) throw new Error('Storage write blocked');
      stored = value;
      writes.push(value);
    },
  };
  const context = {
    exports: {},
    window: { matchMedia: () => ({ matches: true }) },
  };
  Object.defineProperty(context, 'localStorage', {
    get() {
      if (failAccess) throw new Error('Storage unavailable');
      return storage;
    },
  });
  vm.runInNewContext(compiled, context);
  return { ...context.exports, writes };
}

const tests = [
  ['starts in light mode without a saved choice even when the system prefers dark', () => {
    const theme = loadTheme();
    assert.equal(theme.readTheme(), 'light');
    assert.deepEqual(theme.writes, []);
  }],
  ['restores both existing choices without overwriting them during repeated startup reads', () => {
    for (const saved of ['light', 'dark']) {
      const theme = loadTheme(saved);
      assert.equal(theme.readTheme(), saved);
      assert.equal(theme.readTheme(), saved);
      assert.deepEqual(theme.writes, []);
    }
  }],
  ['falls back to light for invalid saved preferences', () => {
    for (const invalid of ['', 'system', 'DARK', 'invalid']) {
      assert.equal(loadTheme(invalid).readTheme(), 'light');
    }
  }],
  ['persists explicit choices for the next startup', () => {
    const theme = loadTheme();
    theme.writeTheme('dark');
    assert.equal(theme.readTheme(), 'dark');
    theme.writeTheme('light');
    assert.equal(theme.readTheme(), 'light');
    assert.deepEqual(theme.writes, ['dark', 'light']);
  }],
  ['keeps theme controls usable when storage is blocked', () => {
    const theme = loadTheme(null, { failRead: true, failWrite: true });
    assert.equal(theme.readTheme(), 'light');
    assert.doesNotThrow(() => theme.writeTheme('dark'));
    const unavailable = loadTheme(null, { failAccess: true });
    assert.equal(unavailable.readTheme(), 'light');
    assert.doesNotThrow(() => unavailable.writeTheme('light'));
  }],
];

for (const [name, run] of tests) {
  run();
  console.log(`PASS ${name}`);
}
console.log(`\n${tests.length} theme tests passed`);
