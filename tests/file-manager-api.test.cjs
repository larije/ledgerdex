/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS integration runner. */
// Explicit opt-in: FILE_MANAGER_TEST_URL must be this app on localhost using this .env database.
// Every fixture has a unique marker. Cleanup touches only this run's rows and stored bytes.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const https = require("node:https");
const { Readable } = require("node:stream");
const path = require("node:path");
const { PrismaClient } = require("../src/generated/prisma");

const ROOT = "/api/file-manager";
const LIMIT = 50 * 1024 * 1024;

async function main() {
  assert.ok(process.env.FILE_MANAGER_TEST_URL, "Set FILE_MANAGER_TEST_URL to the local development server URL.");
  const baseUrl = new URL(process.env.FILE_MANAGER_TEST_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname), "Use a local test server.");
  assert.ok(["http:", "https:"].includes(baseUrl.protocol));
  const storage = process.env.FILE_MANAGER_DIR;
  assert.ok(storage && path.isAbsolute(storage), "Set FILE_MANAGER_DIR to the server's absolute storage directory.");
  const marker = `[FILE MANAGER TEST] ${randomUUID()}`;
  const prisma = new PrismaClient();
  const fileIds = new Set();
  const folderIds = new Set();

  async function request(url, options = {}) {
    const headers = new Headers(options.headers);
    if (options.method && !["GET", "HEAD"].includes(options.method.toUpperCase())) {
      if (!headers.has("Origin")) headers.set("Origin", baseUrl.origin);
      if (!headers.has("Sec-Fetch-Site")) headers.set("Sec-Fetch-Site", "same-origin");
    }
    const response = await fetch(new URL(url, baseUrl), { ...options, headers });
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    return { status: response.status, body, headers: response.headers };
  }
  function json(url, method, value, headers = {}) {
    return request(url, {
      method, headers: { "Content-Type": "application/json", ...headers },
      body: typeof value === "string" ? value : JSON.stringify(value),
    });
  }
  async function upload(name, bytes, folderId, mime = "application/octet-stream") {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), name);
    if (folderId !== undefined) form.append("folderId", folderId);
    const result = await request(ROOT, { method: "POST", body: form });
    if (result.status === 201 && result.body.file?.id) fileIds.add(result.body.file.id);
    return result;
  }
  async function folder(name) {
    const result = await json(`${ROOT}/folders`, "POST", { name });
    if (result.status === 201 && result.body.folder?.id) folderIds.add(result.body.folder.id);
    return result;
  }
  function listed(params = {}) {
    return request(`${ROOT}?${new URLSearchParams(params)}`);
  }
  function ids(result) {
    return result.body.files.map((file) => file.id);
  }
  function assertDto(file) {
    assert.equal(typeof file.id, "string");
    assert.equal(typeof file.name, "string");
    assert.equal(typeof file.fileSize, "number");
    assert.ok(!Object.hasOwn(file, "storedName"), "storage names must remain private");
  }
  async function download(id, preview = false) {
    return fetch(new URL(`${ROOT}/files/${id}/download${preview ? "?preview=1" : ""}`, baseUrl));
  }
  async function namedDownload(file) {
    const safeName = file.name.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, "_");
    return fetch(new URL(`${ROOT}/files/${encodeURIComponent(file.id)}/download/${encodeURIComponent(safeName)}`, baseUrl));
  }
  async function oversizedUpload() {
    const destination = new URL(ROOT, baseUrl);
    const client = destination.protocol === "https:" ? https : http;
    const boundary = `file-manager-test-${randomUUID()}`;
    const prefix = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${marker} oversized.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\n`);
    const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    const paddingLength = LIMIT + 1 - Buffer.byteLength("%PDF-1.4\n");
    return new Promise((resolve, reject) => {
      const req = client.request(destination, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": prefix.length + paddingLength + suffix.length,
          Origin: baseUrl.origin,
          "Sec-Fetch-Site": "same-origin",
        },
      }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          let body;
          try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { body = null; }
          if (body?.file?.id) fileIds.add(body.file.id);
          resolve({ status: response.statusCode, body });
        });
      });
      req.setTimeout(30000, () => req.destroy(new Error("Oversized upload timed out.")));
      req.on("error", reject);
      const chunk = Buffer.alloc(64 * 1024, 0x20);
      function* parts() {
        yield prefix;
        let remaining = paddingLength;
        while (remaining > 0) {
          const length = Math.min(chunk.length, remaining);
          yield length === chunk.length ? chunk : chunk.subarray(0, length);
          remaining -= length;
        }
        yield suffix;
      }
      Readable.from(parts()).pipe(req);
    });
  }

  try {
    const originalCounts = [await prisma.property.count(), await prisma.delinquentAccount.count()];
    const baseline = await listed();
    assert.equal(baseline.status, 200);
    assert.equal(baseline.body.pageSize, 50);
    assert.equal(baseline.body.maxFileSize, LIMIT);
    const initialAll = baseline.body.counts.all;
    const initialTrash = baseline.body.counts.trash;

    const primary = await folder(`${marker} Primary`);
    assert.equal(primary.status, 201, JSON.stringify(primary.body));
    const secondary = await folder(`${marker} Secondary`);
    assert.equal(secondary.status, 201, JSON.stringify(secondary.body));
    const disposable = await folder(`${marker} Empty`);
    assert.equal(disposable.status, 201, JSON.stringify(disposable.body));
    assert.ok([200, 204].includes((await request(`${ROOT}/folders/${disposable.body.folder.id}`, { method: "DELETE" })).status),
      "an empty folder can be deleted");
    const primaryId = primary.body.folder.id;
    const secondaryId = secondary.body.folder.id;
    assert.equal((await folder(`${marker} Primary`)).status, 409, "folder names are unique");

    const pdfName = `${marker} résumé 日本語.pdf`;
    const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n", "utf8");
    const first = await upload(pdfName, pdfBytes, primaryId, "application/pdf");
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assertDto(first.body.file);
    assert.equal(first.body.file.name, pdfName);
    assert.equal(first.body.file.extension, "pdf");
    assert.equal(first.body.file.fileSize, pdfBytes.length);
    const second = await upload(pdfName, pdfBytes, primaryId, "application/pdf");
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.notEqual(second.body.file.id, first.body.file.id, "same original name creates a separate file");
    assert.equal(second.body.file.name, pdfName);
    const stored = await prisma.managedFile.findMany({ where: { id: { in: [first.body.file.id, second.body.file.id] } } });
    assert.equal(stored.length, 2);
    assert.notEqual(stored[0].storedName, stored[1].storedName, "uploads never overwrite stored bytes");

    const csvName = `${marker} accounts.csv`;
    const csvBytes = Buffer.from("account,amount\nA-1,42\n", "utf8");
    const csv = await upload(csvName, csvBytes, secondaryId, "text/csv");
    assert.equal(csv.status, 201, JSON.stringify(csv.body));
    const XLSX = require("xlsx");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Account", "Amount"], ["A-1", 42]]), "Data");
    const xlsxBytes = Buffer.from(XLSX.write(book, { bookType: "xlsx", type: "buffer" }));
    const xlsx = await upload(`${marker} ledger.xlsx`, xlsxBytes, secondaryId,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.equal(xlsx.status, 201, JSON.stringify(xlsx.body));
    const JSZip = require("jszip");
    const documentZip = new JSZip();
    documentZip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    documentZip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    documentZip.file("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>File Manager test</w:t></w:r></w:p></w:body></w:document>');
    const docxBytes = await documentZip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const docx = await upload(`${marker} note.docx`, docxBytes, secondaryId,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    assert.equal(docx.status, 201, JSON.stringify(docx.body));
    const largeBytes = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(11 * 1024 * 1024, 0x20), Buffer.from("\n%%EOF\n")]);
    const large = await upload(`${marker} above-ten-megabytes.pdf`, largeBytes, secondaryId, "application/pdf");
    assert.equal(large.status, 201, JSON.stringify(large.body));

    for (const [file, expected] of [[first, pdfBytes], [csv, csvBytes], [xlsx, xlsxBytes], [docx, docxBytes], [large, largeBytes]]) {
      const response = await download(file.body.file.id);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-disposition") ?? "", /^attachment;/i);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected, "downloaded bytes match the upload");
      const namedResponse = await namedDownload(file.body.file);
      assert.equal(namedResponse.status, 200);
      assert.equal(namedResponse.headers.get("content-type"), response.headers.get("content-type"));
      assert.equal(namedResponse.headers.get("content-disposition"), response.headers.get("content-disposition"));
      assert.deepEqual(Buffer.from(await namedResponse.arrayBuffer()), expected, "Office-compatible named URL serves identical bytes");
    }
    const unicodeDownload = await download(first.body.file.id);
    assert.ok((unicodeDownload.headers.get("content-disposition") ?? "").includes(encodeURIComponent(pdfName)));
    assert.equal((await download(first.body.file.id, true)).headers.get("content-disposition")?.split(";")[0], "inline");
    assert.notEqual((await download(csv.body.file.id, true)).headers.get("content-disposition")?.split(";")[0], "inline",
      "only PDFs may open inline");
    console.log("PASS upload, duplicate names, private storage names, exact bytes, Unicode disposition, and PDF preview");

    const scoped = await listed({ folderId: primaryId });
    assert.equal(scoped.status, 200);
    assert.deepEqual(new Set(ids(scoped)), new Set([first.body.file.id, second.body.file.id]));
    assert.equal(scoped.body.folders.find((item) => item.id === primaryId)._count.files, 2);
    assert.equal((await listed({ folderId: "root" })).body.files.some((item) => fileIds.has(item.id)), false);
    assert.deepEqual(new Set(ids(await listed({ search: marker }))), fileIds);
    assert.deepEqual(new Set(ids(await listed({ search: marker, type: "pdf" }))), new Set([first.body.file.id, second.body.file.id, large.body.file.id]));
    assert.deepEqual(new Set(ids(await listed({ search: marker, type: "word" }))), new Set([docx.body.file.id]));
    assert.deepEqual(new Set(ids(await listed({ search: marker, type: "excel" }))), new Set([csv.body.file.id, xlsx.body.file.id]));
    assert.equal((await listed()).body.counts.all, initialAll + 6);
    console.log("PASS folder filter, search, type filters, active counts, and folder file counts");

    const renamedFolder = await json(`${ROOT}/folders/${secondaryId}`, "PATCH", { name: `${marker} Archive` });
    assert.equal(renamedFolder.status, 200, JSON.stringify(renamedFolder.body));
    assert.equal(renamedFolder.body.folder.name, `${marker} Archive`);
    const move = await json(`${ROOT}/files/${csv.body.file.id}`, "PATCH", { folderId: primaryId });
    assert.equal(move.status, 200, JSON.stringify(move.body));
    assert.equal(move.body.file.folderId, primaryId);
    assert.equal((await listed({ folderId: primaryId })).body.folders.find((item) => item.id === primaryId)._count.files, 3);
    const renamed = await json(`${ROOT}/files/${csv.body.file.id}`, "PATCH", { name: `${marker} moved.csv` });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    assert.equal(renamed.body.file.name, `${marker} moved.csv`);
    assert.equal((await json(`${ROOT}/files/${csv.body.file.id}`, "PATCH", { name: `${marker} moved.pdf` })).status, 400);
    assert.equal((await json(`${ROOT}/files/${csv.body.file.id}`, "PATCH", { folderId: null })).status, 200);
    assert.ok(ids(await listed({ folderId: "root" })).includes(csv.body.file.id));
    assert.equal((await json(`${ROOT}/folders/${primaryId}`, "DELETE", {})).status, 409, "nonempty folders cannot be deleted");
    console.log("PASS rename, move, root, extension preservation, and nonempty folder conflict");

    const trash = await json(`${ROOT}/files/${first.body.file.id}`, "PATCH", { trashed: true });
    assert.equal(trash.status, 200, JSON.stringify(trash.body));
    assert.equal(ids(await listed({ search: marker })).includes(first.body.file.id), false);
    assert.ok(ids(await listed({ trash: "1", search: marker })).includes(first.body.file.id));
    assert.equal((await download(first.body.file.id)).status, 404);
    assert.equal((await namedDownload(first.body.file)).status, 404, "Office-compatible URL cannot open trashed files");
    assert.equal((await listed()).body.counts.all, initialAll + 5);
    assert.equal((await listed()).body.counts.trash, initialTrash + 1);
    const restore = await json(`${ROOT}/files/${first.body.file.id}`, "PATCH", { trashed: false });
    assert.equal(restore.status, 200, JSON.stringify(restore.body));
    assert.deepEqual(Buffer.from(await (await download(first.body.file.id)).arrayBuffer()), pdfBytes);
    assert.equal((await listed()).body.counts.all, initialAll + 6);
    assert.equal((await listed()).body.counts.trash, initialTrash);
    console.log("PASS trash, hidden download, restore, exact bytes, and count changes");

    // Fifty-one tiny uploads establish a real second page within a uniquely searchable set.
    for (let index = 0; index < 51; index++) {
      const result = await upload(`${marker} page-${String(index).padStart(2, "0")}.csv`, Buffer.from("a,b\n1,2\n"), secondaryId, "text/csv");
      assert.equal(result.status, 201, `pagination fixture ${index}: ${JSON.stringify(result.body)}`);
    }
    const pageOne = await listed({ search: marker, page: "1" });
    const pageTwo = await listed({ search: marker, page: "2" });
    assert.equal(pageOne.body.total, 57);
    assert.equal(pageOne.body.files.length, 50);
    assert.equal(pageTwo.body.files.length, 7);
    assert.equal(pageTwo.body.page, 2);
    assert.equal(new Set([...ids(pageOne), ...ids(pageTwo)]).size, 57);
    console.log("PASS pagination across the 50-file boundary");

    assert.equal((await folder(" ")).status, 400);
    assert.equal((await json(`${ROOT}/folders`, "POST", "{")).status, 400);
    assert.equal((await json(`${ROOT}/folders/${randomUUID()}`, "PATCH", { name: `${marker} Missing` })).status, 404);
    assert.equal((await json(`${ROOT}/files/${randomUUID()}`, "PATCH", { name: "missing.pdf" })).status, 404);
    assert.equal((await download(randomUUID())).status, 404);
    assert.equal((await upload(`${marker}.txt`, Buffer.from("bad"))).status, 400);
    for (const inheritedName of ["constructor", "toString", "__proto__"]) {
      assert.equal((await upload(`${marker}.${inheritedName}`, Buffer.from("bad"))).status, 400);
    }
    assert.equal((await upload(`${marker} empty.csv`, Buffer.alloc(0))).status, 400);
    assert.equal((await upload(`${marker} orphan.csv`, Buffer.from("x"), randomUUID())).status, 404);
    assert.equal((await json(`${ROOT}/files/${csv.body.file.id}`, "PATCH", { folderId: 42 })).status, 400);
    assert.equal((await json(`${ROOT}/files/${csv.body.file.id}`, "PATCH", { trashed: "true" })).status, 400);
    assert.equal((await json(`${ROOT}/files/${csv.body.file.id}`, "PATCH", { name: "../escape.csv" })).status, 400);
    assert.equal((await listed({ page: "0" })).status, 400);
    assert.equal((await listed({ type: "image" })).status, 400);
    const rawBoundary = `test-${randomUUID()}`;
    const rawMultipart = `--${rawBoundary}\r\nContent-Disposition: form-data; name="file"; filename="../${marker} traversal.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\r\n--${rawBoundary}--\r\n`;
    const traversal = await request(ROOT, { method: "POST", headers: { "Content-Type": `multipart/form-data; boundary=${rawBoundary}` }, body: rawMultipart });
    assert.ok([201, 400].includes(traversal.status), "traversal filename must be rejected or normalized safely by multipart parsing");
    if (traversal.status === 201) {
      fileIds.add(traversal.body.file.id);
      assertDto(traversal.body.file);
      assert.equal(traversal.body.file.name, `${marker} traversal.pdf`);
    }
    const crossOrigin = { Origin: "https://example.invalid" };
    assert.equal((await json(`${ROOT}/folders`, "POST", { name: `${marker} Denied` }, crossOrigin)).status, 403);
    assert.equal((await json(`${ROOT}/files/${csv.body.file.id}`, "PATCH", { trashed: true }, crossOrigin)).status, 403);
    assert.equal((await json(`${ROOT}/folders/${secondaryId}`, "DELETE", {}, crossOrigin)).status, 403);
    assert.equal((await json(`${ROOT}/files/${csv.body.file.id}`, "PATCH", { trashed: true }, { "Sec-Fetch-Site": "cross-site" })).status, 403);
    assert.equal((await oversizedUpload()).status, 413, "over-limit body with accurate Content-Length must be rejected");
    assert.deepEqual([await prisma.property.count(), await prisma.delinquentAccount.count()], originalCounts);
    console.log("PASS malformed input, traversal, oversized upload, missing IDs, cross-origin denial, and unrelated row counts");
  } finally {
    try {
      const ownFiles = await prisma.managedFile.findMany({
        where: { id: { in: [...fileIds] } }, select: { id: true, storedName: true },
      });
      const ownIds = ownFiles.map((file) => file.id);
      for (const file of ownFiles) {
        assert.match(file.storedName, /^[0-9a-f-]{36}$/i, "unexpected stored filename; refusing unsafe cleanup");
        const target = path.resolve(storage, file.storedName);
        const relative = path.relative(path.resolve(storage), target);
        assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "cleanup target escaped FILE_MANAGER_DIR");
        await fs.rm(target, { force: true });
      }
      if (ownIds.length) await prisma.managedFile.deleteMany({ where: { id: { in: ownIds } } });
      const ownFolders = await prisma.fileFolder.findMany({
        where: { id: { in: [...folderIds] } }, select: { id: true, _count: { select: { files: true } } },
      });
      const emptyOwnIds = ownFolders.filter((folder) => folder._count.files === 0).map((folder) => folder.id);
      if (emptyOwnIds.length) await prisma.fileFolder.deleteMany({ where: { id: { in: emptyOwnIds } } });
    } finally {
      await prisma.$disconnect();
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
