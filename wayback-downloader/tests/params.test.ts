import { test } from "node:test";
import assert from "node:assert/strict";
import { parseParams, BadRequest, MAX_FILES_DEFAULT } from "../src/lib/params.js";

test("requires a domain", () => {
  assert.throws(() => parseParams({}), BadRequest);
});

test("applies sensible defaults", () => {
  const params = parseParams({ domain: "example.com" });
  assert.equal(params.domain, "example.com");
  assert.equal(params.exactUrl, false);
  assert.equal(params.onlyStatus200, true);
  assert.equal(params.allSnapshots, false);
  assert.deepEqual(params.extensions, []);
  assert.equal(params.maxFiles, MAX_FILES_DEFAULT);
});

test("rejects malformed dates", () => {
  assert.throws(() => parseParams({ domain: "example.com", fromTs: "not-a-date" }), BadRequest);
});

test("rejects invalid regular expressions", () => {
  assert.throws(() => parseParams({ domain: "example.com", onlyPattern: "(" }), BadRequest);
});

test("sanitizes extensions and caps maxFiles", () => {
  const params = parseParams({
    domain: "example.com",
    extensions: ["html", ".css!!", "js"],
    maxFiles: MAX_FILES_DEFAULT + 5000,
  });
  assert.deepEqual(params.extensions, ["html", "css", "js"]);
  assert.equal(params.maxFiles, MAX_FILES_DEFAULT);
});
