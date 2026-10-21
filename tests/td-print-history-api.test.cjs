/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS integration runner. */
// Explicit opt-in: TD_PRINT_TEST_URL must point to the local app using this .env database.
// Creates uniquely labelled test batches and removes only those batches and their audit events.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { PrismaClient } = require("../src/generated/prisma");

async function main() {
  assert.ok(process.env.TD_PRINT_TEST_URL, "Set TD_PRINT_TEST_URL to the local development server URL.");
  const baseUrl = new URL(process.env.TD_PRINT_TEST_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname), "Use a local test server.");
  const prisma = new PrismaClient();
  const location = `[TD HISTORY TEST] ${randomUUID()}`;
  const numbers = [
    "2023-05-0013-0053", "2023-05-0013-00278", "2023-05-0013-00151", "2023-05-0013-00276",
    "2023-05-0013-00132", "2023-05-0013-00133", "2023-05-0013-00128", "2023-05-0013-00547",
    "2023-05-0013-00081", "2023-05-0013-00563", "2023-05-0013-00559", "2023-05-0013-00083",
    "2023-05-0013-00064", "2023-05-0013-00030", "2023-05-0013-00187", "2023-05-0013-00001",
    "2023-05-0013-00069", "2023-05-0013-00169", "2023-05-0013-00031", "2023-05-0013-00017",
  ];
  const text = "The \\*\\*TD Numbers for NEW SAMBONG\\*\\* are:\n" + numbers.map((number, index) => `${index + 1}\\. &#x20;${number}&#x20;`).join("\n");

  async function request(path, options) {
    const response = await fetch(new URL(path, baseUrl), options);
    return { status: response.status, body: await response.json() };
  }
  function post(body, headers = {}) {
    return request("/api/td-print-batches", {
      method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
    });
  }
  function patch(batchId, entryId, body, rawBody = false, headers = {}) {
    return request(`/api/td-print-batches/${batchId}/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: rawBody ? body : JSON.stringify(body),
    });
  }
  function patchNote(batchId, body, rawBody = false, headers = {}) {
    return request(`/api/td-print-batches/${batchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: rawBody ? body : JSON.stringify(body),
    });
  }
  try {
    const originalCounts = [await prisma.property.count(), await prisma.delinquentAccount.count()];
    const requestId = randomUUID();
    const first = await post({ requestId, location: `  ${location}  `, printedOn: "2026-09-29", text });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.batch.location, location);
    assert.equal(first.body.batch.printedOn.slice(0, 10), "2026-09-29");
    assert.deepEqual(first.body.batch.entries.map((entry) => entry.tdNumber), numbers);
    assert.deepEqual(first.body.batch.entries.map((entry) => entry.position), Array.from({ length: 20 }, (_, index) => index + 1));
    const persisted = await prisma.tDPrintBatch.findUnique({ where: { id: first.body.batch.id }, include: { entries: true } });
    assert.equal(persisted.location, location);
    assert.equal(persisted.entries.length, 20);
    assert.equal(persisted.note, null, "new batches have no note");
    assert.ok(persisted.entries.every((entry) => entry.isPrinted === false), "new entries start unprinted in the database");
    assert.ok(first.body.batch.entries.every((entry) => entry.isPrinted === false), "new entries return unprinted");

    const detail = await request(`/api/td-print-batches/${first.body.batch.id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.batch.note, null);
    assert.deepEqual(detail.body.batch.entries.map((entry) => entry.tdNumber), numbers);
    assert.ok(detail.body.batch.entries.every((entry) => entry.isPrinted === false), "detail reload preserves each printed mark");
    console.log("PASS save, database persistence, ordered detail, and exact 20-number sample");

    const reprint = await post({ location, printedOn: "2026-09-30", text: text + "\n2023-05-0013-0053" });
    assert.equal(reprint.status, 201, JSON.stringify(reprint.body));
    assert.notEqual(reprint.body.batch.id, first.body.batch.id);
    assert.equal(reprint.body.batch.entries.length, 20);

    const batchId = first.body.batch.id;
    const savedNote = "For review\nNeeds  follow-up.";
    const noteAdded = await patchNote(batchId, { note: `  ${savedNote}  ` });
    assert.equal(noteAdded.status, 200, JSON.stringify(noteAdded.body));
    assert.deepEqual(noteAdded.body, { batch: { id: batchId, note: savedNote } });
    assert.equal((await prisma.tDPrintBatch.findUnique({ where: { id: batchId } })).note, savedNote);
    assert.equal((await request(`/api/td-print-batches/${batchId}`)).body.batch.note, savedNote);
    const noteList = await request(`/api/td-print-batches?search=${encodeURIComponent(location)}`);
    assert.equal(noteList.body.batches.find((batch) => batch.id === batchId).note, savedNote);
    assert.equal(noteList.body.batches.find((batch) => batch.id === reprint.body.batch.id).note, null,
      "notes belong to one batch even when batches contain the same TD numbers");

    const editedNote = "Updated instructions";
    assert.equal((await patchNote(batchId, { note: editedNote })).body.batch.note, editedNote);
    const limitNote = "x".repeat(1000);
    assert.equal((await patchNote(batchId, { note: limitNote })).body.batch.note, limitNote);
    for (const note of ["", " \n\t "]) {
      assert.equal((await patchNote(batchId, { note })).body.batch.note, null);
      assert.equal((await prisma.tDPrintBatch.findUnique({ where: { id: batchId } })).note, null);
      assert.equal((await request(`/api/td-print-batches/${batchId}`)).body.batch.note, null);
    }
    assert.equal((await patchNote(batchId, { note: savedNote })).status, 200);
    for (const body of [null, [], {}, { note: null }, { note: false }, { note: 123 },
      { note: ["text"] }, { note: {} }, { note: "x".repeat(1001) },
      { note: "text", extra: true }, { note: "text", location: "Changed" }]) {
      assert.equal((await patchNote(batchId, body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await patchNote(batchId, "{", true)).status, 400);
    assert.equal((await patchNote(randomUUID(), { note: "missing batch" })).status, 404);
    const afterNotes = await prisma.tDPrintBatch.findUnique({ where: { id: batchId }, include: { entries: true } });
    assert.equal(afterNotes.note, savedNote, "invalid writes preserve the saved note");
    assert.equal(afterNotes.location, persisted.location);
    assert.deepEqual(afterNotes.printedOn, persisted.printedOn);
    assert.deepEqual(afterNotes.createdAt, persisted.createdAt);
    assert.deepEqual(afterNotes.entries, persisted.entries, "note edits leave TD entries unchanged");
    const noteAudit = await prisma.auditLog.findMany({
      where: { action: "TD_PRINT_BATCH_NOTE_UPDATE", details: { startsWith: `Batch ${batchId}:` } },
    });
    assert.ok(noteAudit.length > 0, "note changes are audited");
    assert.ok(noteAudit.every((event) => [`Batch ${batchId}: note updated`, `Batch ${batchId}: note cleared`].includes(event.details)),
      "audit events identify the batch without copying note content");
    console.log("PASS batch notes add/edit/clear/read, persistence, length limit, validation, audit, and isolation");

    const firstEntry = first.body.batch.entries[0];
    const sameTdInReprint = reprint.body.batch.entries.find((entry) => entry.tdNumber === firstEntry.tdNumber);
    assert.ok(sameTdInReprint, "reprint contains the same TD number");
    const mark = await patch(first.body.batch.id, firstEntry.id, { isPrinted: true });
    assert.equal(mark.status, 200, JSON.stringify(mark.body));
    assert.deepEqual(mark.body.entry, {
      id: firstEntry.id, tdNumber: firstEntry.tdNumber, position: firstEntry.position, isPrinted: true,
    });
    assert.equal(await prisma.tDPrintEntry.findUnique({ where: { id: firstEntry.id } }).then((entry) => entry.isPrinted), true);
    const markedDetail = await request(`/api/td-print-batches/${first.body.batch.id}`);
    assert.equal(markedDetail.body.batch.entries[0].isPrinted, true);
    assert.equal(markedDetail.body.batch.entries[1].isPrinted, false, "marking one entry leaves the next entry untouched");
    const reprintDetail = await request(`/api/td-print-batches/${reprint.body.batch.id}`);
    assert.equal(reprintDetail.body.batch.entries.find((entry) => entry.tdNumber === firstEntry.tdNumber).isPrinted, false,
      "same TD number in another batch has its own mark");
    const unmark = await patch(first.body.batch.id, firstEntry.id, { isPrinted: false });
    assert.equal(unmark.status, 200);
    assert.equal(unmark.body.entry.isPrinted, false);
    const markAgain = await patch(first.body.batch.id, firstEntry.id, { isPrinted: true });
    assert.equal(markAgain.status, 200);
    const markAgainRetry = await patch(first.body.batch.id, firstEntry.id, { isPrinted: true });
    assert.equal(markAgainRetry.status, 200);
    assert.equal(markAgainRetry.body.entry.isPrinted, true, "repeating the desired state is idempotent");
    assert.equal((await patch(reprint.body.batch.id, firstEntry.id, { isPrinted: true })).status, 404,
      "an entry cannot be updated through a different batch");
    assert.equal((await patch(first.body.batch.id, randomUUID(), { isPrinted: true })).status, 404);
    for (const body of [null, { isPrinted: "true" }, { isPrinted: null }, {}, { isPrinted: true, extra: true }]) {
      assert.equal((await patch(first.body.batch.id, firstEntry.id, body)).status, 400);
    }
    assert.equal((await patch(first.body.batch.id, firstEntry.id, "{", true)).status, 400);
    console.log("PASS per-entry printed marks, persistence, isolation, idempotent updates, and PATCH validation");
    const search = await request(`/api/td-print-batches?search=${encodeURIComponent(location)}`);
    assert.equal(search.body.total, 2);
    assert.deepEqual(search.body.batches.map((batch) => batch.id), [reprint.body.batch.id, first.body.batch.id]);
    assert.equal(search.body.batches[0]._count.entries, 20);
    const tdSearch = await request("/api/td-print-batches?search=2023-05-0013-0053");
    assert.ok(tdSearch.body.batches.some((batch) => batch.id === reprint.body.batch.id));
    assert.equal((await request(`/api/td-print-batches?search=${encodeURIComponent(location)}&page=2`)).body.batches.length, 0);
    console.log("PASS per-batch deduplication, reprints, TD/location search, ordering, pagination");

    const retry = await post({ requestId, location, printedOn: "2026-09-29", text });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.batch.id, first.body.batch.id);
    assert.equal(retry.body.batch.entries[0].isPrinted, true, "retrying batch creation preserves its printed marks");
    assert.equal(retry.body.batch.note, savedNote, "retrying batch creation preserves its note");
    assert.equal((await post({ requestId, location, printedOn: "2026-09-30", text })).status, 409);
    assert.equal((await post({ requestId: "invalid", location, printedOn: "2026-09-30", text })).status, 400);
    assert.equal(await prisma.tDPrintBatch.count({ where: { location } }), 2);
    console.log("PASS safe save retries and conflicting request IDs rejected");

    for (const body of [
      null,
      { location: " ", printedOn: "2026-09-30", text },
      { location, printedOn: "2026-02-30", text },
      { location, printedOn: "0001-01-01", text },
      { location, printedOn: "2026-09-30", text: "2023-05-0013-0053\n2023-05-0013-bad" },
      { location, printedOn: "2026-09-30", text: "" },
    ]) assert.equal((await post(body)).status, 400);
    assert.equal((await request("/api/td-print-batches", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status, 400);
    assert.equal((await request("/api/td-print-batches?page=0")).status, 400);
    assert.equal((await request(`/api/td-print-batches?search=${"a".repeat(256)}`)).status, 400);
    assert.equal((await request(`/api/td-print-batches/${randomUUID()}`)).status, 404);

    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ id: "td-history-test-viewer", role: "VIEWER" })
      .setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m")
      .sign(new TextEncoder().encode(process.env.JWT_SECRET ?? "ledgerdex-secret-change-in-production"));
    const viewerHeaders = { Cookie: `ledgerdex_token=${token}` };
    assert.equal((await post({ location, printedOn: "2026-09-30", text }, viewerHeaders)).status, 403);
    assert.equal((await patch(first.body.batch.id, firstEntry.id, { isPrinted: false }, false, viewerHeaders)).status, 403);
    assert.equal((await patchNote(batchId, { note: "unauthorized edit" }, false, viewerHeaders)).status, 403);
    assert.equal((await patchNote(batchId, { note: "" }, false, viewerHeaders)).status, 403);
    const viewerDetail = await request(`/api/td-print-batches/${batchId}`, { headers: viewerHeaders });
    assert.equal(viewerDetail.status, 200);
    assert.equal(viewerDetail.body.batch.note, savedNote, "viewers can read the note but cannot change or clear it");
    assert.equal((await prisma.tDPrintBatch.findUnique({ where: { id: batchId } })).note, savedNote);
    assert.equal((await prisma.tDPrintEntry.findUnique({ where: { id: firstEntry.id } })).isPrinted, true,
      "denied updates leave the mark unchanged");
    assert.equal(await prisma.tDPrintBatch.count({ where: { location } }), 2);
    assert.deepEqual([await prisma.property.count(), await prisma.delinquentAccount.count()], originalCounts);
    console.log("PASS invalid requests write nothing, viewer denied, and other record counts unchanged");
  } finally {
    const testBatches = await prisma.tDPrintBatch.findMany({ where: { location }, select: { id: true } });
    await prisma.tDPrintBatch.deleteMany({ where: { location } });
    await prisma.auditLog.deleteMany({ where: { action: "TD_PRINT_BATCH_CREATE", details: { startsWith: `${location}:` } } });
    await prisma.auditLog.deleteMany({
      where: {
        action: "TD_PRINT_BATCH_NOTE_UPDATE",
        details: { in: testBatches.flatMap(({ id }) => [`Batch ${id}: note updated`, `Batch ${id}: note cleared`]) },
      },
    });
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
