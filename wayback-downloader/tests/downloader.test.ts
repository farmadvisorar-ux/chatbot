import { test } from "node:test";
import assert from "node:assert/strict";
import { downloadSnapshots } from "../src/lib/downloader.js";
import type { Snapshot } from "../src/lib/cdx.js";

function snap(url: string, timestamp = "20200101000000"): Snapshot {
  return { timestamp, original: url, statuscode: "200", digest: "", mimetype: "text/html" };
}

function fakeResponse(body = "hello", ok = true, status = 200): Response {
  return {
    ok,
    status,
    blob: async () => new Blob([body]),
  } as unknown as Response;
}

test("downloads every snapshot and reports ok events", async () => {
  const snapshots = [snap("http://example.com/"), snap("http://example.com/about.html")];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => fakeResponse()) as typeof fetch;

  try {
    const events: string[] = [];
    const result = await downloadSnapshots(snapshots, {
      onEvent: (event) => events.push(event.type),
    });

    assert.equal(result.completed, 2);
    assert.equal(result.failed, 0);
    assert.equal(result.skipped, 0);
    assert.equal(result.files.length, 2);
    assert.deepEqual(events.sort(), ["ok", "ok"]);
    assert.ok(result.files.some((f) => f.name === "example.com/index.html"));
    assert.ok(result.files.some((f) => f.name === "example.com/about.html"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("records failures without stopping the rest", async () => {
  const snapshots = [snap("http://example.com/ok.html"), snap("http://example.com/broken.html")];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (String(url).includes("broken")) throw new Error("boom");
    return fakeResponse();
  }) as typeof fetch;

  try {
    const result = await downloadSnapshots(snapshots);
    assert.equal(result.completed, 1);
    assert.equal(result.failed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("skips a second snapshot that maps to the same file path", async () => {
  const snapshots = [snap("http://example.com/"), snap("http://example.com/", "20210101000000")];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => fakeResponse()) as typeof fetch;

  try {
    const result = await downloadSnapshots(snapshots);
    assert.equal(result.completed, 1);
    assert.equal(result.skipped, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("all-snapshots mode keeps each timestamp as a separate file", async () => {
  const snapshots = [snap("http://example.com/", "20200101000000"), snap("http://example.com/", "20210101000000")];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => fakeResponse()) as typeof fetch;

  try {
    const result = await downloadSnapshots(snapshots, { allSnapshots: true });
    assert.equal(result.completed, 2);
    assert.equal(result.skipped, 0);
    assert.ok(result.files.some((f) => f.name === "example.com/20200101000000/index.html"));
    assert.ok(result.files.some((f) => f.name === "example.com/20210101000000/index.html"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stops early when cancelled", async () => {
  const snapshots = Array.from({ length: 5 }, (_, i) => snap(`http://example.com/${i}.html`));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => fakeResponse()) as typeof fetch;

  try {
    const result = await downloadSnapshots(snapshots, { concurrency: 1, isCancelled: () => true });
    assert.equal(result.cancelled, true);
    assert.equal(result.completed, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
