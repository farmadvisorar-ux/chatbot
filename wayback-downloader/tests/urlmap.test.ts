import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSegment, urlToFilepath } from "../src/lib/urlmap.js";

test("root path gets index.html", () => {
  assert.equal(urlToFilepath("http://example.com/"), "example.com/index.html");
  assert.equal(urlToFilepath("http://example.com"), "example.com/index.html");
});

test("directory-like path gets index.html", () => {
  assert.equal(urlToFilepath("http://example.com/blog/"), "example.com/blog/index.html");
  assert.equal(urlToFilepath("http://example.com/blog"), "example.com/blog/index.html");
});

test("file with extension is kept as-is", () => {
  assert.equal(urlToFilepath("http://example.com/style.css"), "example.com/style.css");
  assert.equal(urlToFilepath("http://example.com/img/logo.png"), "example.com/img/logo.png");
});

test("query string is appended to the filename", () => {
  assert.equal(urlToFilepath("http://example.com/search?q=hello"), "example.com/search/index@q=hello.html");
  assert.equal(urlToFilepath("http://example.com/style.css?v=2"), "example.com/style@v=2.css");
});

test("illegal characters are sanitized", () => {
  assert.equal(sanitizeSegment('weird:"name"|<>'), "weird__name____");
  assert.equal(sanitizeSegment(""), "_");
});

test("percent-encoded segments are decoded", () => {
  assert.equal(urlToFilepath("http://example.com/hello%20world.html"), "example.com/hello world.html");
});

test("percent-encoded path separators cannot escape the host directory", () => {
  assert.equal(
    urlToFilepath("https://example.com/%2e%2e%2fsecret.txt"),
    "example.com/.._secret.txt",
  );
  assert.equal(
    urlToFilepath("https://example.com/folder%2f..%2fpayload.js"),
    "example.com/folder_.._payload.js",
  );
});

test("deep paths preserve structure", () => {
  assert.equal(urlToFilepath("http://example.com/a/b/c/page.html"), "example.com/a/b/c/page.html");
});
