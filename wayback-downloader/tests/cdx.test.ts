import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCdxParams, parseCdxJson, filterSnapshots, archiveUrl, type Snapshot } from "../api/_lib/cdx.js";

test("parseCdxJson handles empty input", () => {
  assert.deepEqual(parseCdxJson([]), []);
  assert.deepEqual(parseCdxJson([["timestamp", "original"]]), []);
});

test("parseCdxJson parses rows using the header", () => {
  const data = [
    ["timestamp", "original", "statuscode", "digest", "mimetype"],
    ["20200101000000", "http://example.com/", "200", "ABC123", "text/html"],
    ["20200102000000", "http://example.com/about.html", "200", "DEF456", "text/html"],
  ];
  const snapshots = parseCdxJson(data);
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots[0], {
    timestamp: "20200101000000",
    original: "http://example.com/",
    statuscode: "200",
    digest: "ABC123",
    mimetype: "text/html",
  });
  assert.equal(archiveUrl(snapshots[0]), "https://web.archive.org/web/20200101000000id_/http://example.com/");
});

test("parseCdxJson skips incomplete rows", () => {
  const data = [
    ["timestamp", "original"],
    ["20200101000000", ""],
    ["", "http://example.com/"],
    ["20200101000000", "http://example.com/"],
  ];
  assert.equal(parseCdxJson(data).length, 1);
});

test("buildCdxParams sets sensible defaults", () => {
  const params = buildCdxParams("example.com");
  assert.equal(params.get("url"), "example.com");
  assert.equal(params.get("matchType"), "domain");
  assert.equal(params.get("filter"), "statuscode:200");
  assert.equal(params.get("collapse"), "urlkey");
  assert.equal(params.get("from"), null);
});

test("buildCdxParams handles exact URL and all-snapshots modes", () => {
  const params = buildCdxParams("example.com/page", {
    exactUrl: true,
    allSnapshots: true,
    onlyStatus200: false,
    fromTs: "20200101",
    toTs: "20201231",
  });
  assert.equal(params.get("matchType"), "exact");
  assert.equal(params.get("collapse"), null);
  assert.equal(params.get("filter"), null);
  assert.equal(params.get("from"), "20200101");
  assert.equal(params.get("to"), "20201231");
});

function snap(url: string): Snapshot {
  return { timestamp: "20200101000000", original: url, statuscode: "200", digest: "", mimetype: "" };
}

test("filterSnapshots filters by extension", () => {
  const snapshots = [snap("http://example.com/a.html"), snap("http://example.com/b.css"), snap("http://example.com/c.js")];
  const result = filterSnapshots(snapshots, { extensions: ["html", "css"] });
  assert.deepEqual(
    result.map((s) => s.original).sort(),
    ["http://example.com/a.html", "http://example.com/b.css"],
  );
});

test("filterSnapshots applies only/exclude regex patterns", () => {
  const snapshots = [
    snap("http://example.com/blog/post-1"),
    snap("http://example.com/blog/post-2"),
    snap("http://example.com/wp-admin/login"),
  ];
  assert.equal(filterSnapshots(snapshots, { onlyPattern: "/blog/" }).length, 2);
  const excluded = filterSnapshots(snapshots, { excludePattern: "wp-admin" });
  assert.ok(!excluded.some((s) => s.original.includes("wp-admin")));
});
