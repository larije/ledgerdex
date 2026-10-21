/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS test runner. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "..", "src", "lib", "file-open.ts");
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = new Module(sourcePath, module);
loaded.filename = sourcePath;
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
loaded._compile(compiled, sourcePath);
const { getNamedDownloadPath, getOfficeOpenUrl } = loaded.exports;

const file = { id: "test-file", name: "Annual report.docx", extension: "docx" };
const tests = [
  ["routes Word and Excel types to their desktop view command", () => {
    for (const [extension, application] of [["doc", "ms-word"], ["docx", "ms-word"], ["xls", "ms-excel"], ["xlsx", "ms-excel"], ["csv", "ms-excel"], ["XLSX", "ms-excel"]]) {
      const input = { ...file, name: `Annual report.${extension}`, extension };
      assert.equal(getOfficeOpenUrl(input, "http://localhost:3000"), `${application}:ofv|u|http://localhost:3000/api/file-manager/files/test-file/download/Annual%20report.${extension}`);
    }
    for (const extension of ["pdf", "exe", "constructor", "__proto__", "docx|ofe|u|https://example.invalid"]) {
      assert.equal(getOfficeOpenUrl({ ...file, extension }, "http://localhost:3000"), null);
    }
  }],
  ["accepts only HTTP(S) origins and discards credentials, paths, queries, and fragments", () => {
    const suffix = "/api/file-manager/files/test-file/download/Annual%20report.docx";
    assert.equal(getOfficeOpenUrl(file, "https://user:secret@ledger.example:8443/other?url=evil#fragment"), `ms-word:ofv|u|https://ledger.example:8443${suffix}`);
    assert.equal(getOfficeOpenUrl(file, "http://[::1]:3100"), `ms-word:ofv|u|http://[::1]:3100${suffix}`);
    for (const origin of ["", "/relative", "not a URL", "file:///C:/secret", "javascript:alert(1)", "data:text/html,test", "ftp://localhost", "ms-word:ofe|u|https://example.invalid", "https://host|ofe|u|evil.invalid"]) {
      assert.equal(getOfficeOpenUrl(file, origin), null);
    }
  }],
  ["retains Unicode names and extensions while encoding each path segment", () => {
    const input = { id: "id/with?reserved#chars", name: "résumé 日本語 100%.xlsx", extension: "xlsx" };
    const actual = getNamedDownloadPath(input);
    assert.equal(actual, `/api/file-manager/files/${encodeURIComponent(input.id)}/download/${encodeURIComponent(input.name)}`);
    assert.equal(decodeURIComponent(actual.split("/").at(-1)), input.name);
    assert.ok(actual.endsWith(".xlsx"));
  }],
  ["neutralizes filename characters that Windows and Office cannot open", () => {
    const input = { ...file, name: 'A<B>C:D"E/F\\G|H?I*J\x00K\nL\x7f.docx' };
    assert.equal(decodeURIComponent(getNamedDownloadPath(input).split("/").at(-1)), "A_B_C_D_E_F_G_H_I_J_K_L_.docx");
  }],
  ["filename and ID cannot inject another Office command or URL component", () => {
    const input = { id: "id|ofe|u|http://evil.invalid/?q#x", name: "report|ofe|u|https://evil.invalid/?q#x.docx", extension: "docx" };
    const result = getOfficeOpenUrl(input, "http://localhost:3000");
    assert.equal(result.split("|").length, 3);
    assert.ok(result.startsWith("ms-word:ofv|u|http://localhost:3000/api/file-manager/files/"));
    const resource = new URL(result.split("|")[2]);
    assert.equal(resource.origin, "http://localhost:3000");
    assert.equal(resource.search, "");
    assert.equal(resource.hash, "");
    assert.equal(resource.pathname.split("/").length, 7);
  }],
];

for (const [name, test] of tests) {
  test();
  console.log(`PASS ${name}`);
}
console.log(`${tests.length} file-open tests passed.`);
