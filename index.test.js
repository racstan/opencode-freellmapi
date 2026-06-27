import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverModels } from "./index.js";

test("returns empty object for non-array input", () => {
  assert.deepEqual(discoverModels(null), {});
  assert.deepEqual(discoverModels(undefined), {});
  assert.deepEqual(discoverModels("foo"), {});
  assert.deepEqual(discoverModels({}), {});
  assert.deepEqual(discoverModels(42), {});
});

test("returns empty object for empty array", () => {
  assert.deepEqual(discoverModels([]), {});
});

test("skips models that are not available", () => {
  const out = discoverModels([
    { id: "a", available: false, name: "A" },
    { id: "b", available: true, name: "B" },
  ]);
  assert.deepEqual(Object.keys(out).sort(), ["b"]);
  assert.equal(out.b.name, "B");
});

test("skips models missing id or with non-string id", () => {
  assert.deepEqual(
    discoverModels([{ available: true, name: "NoId" }]),
    {},
  );
  assert.deepEqual(
    discoverModels([{ id: "", available: true, name: "Empty" }]),
    {},
  );
  assert.deepEqual(
    discoverModels([{ id: 42, available: true, name: "Numeric" }]),
    {},
  );
});

test("uses id as name when name is missing or empty", () => {
  const out = discoverModels([{ id: "foo", available: true }]);
  assert.equal(out.foo.name, "foo");

  const out2 = discoverModels([{ id: "foo", available: true, name: "" }]);
  assert.equal(out2.foo.name, "foo");
});

test("uses provided context_length", () => {
  const out = discoverModels([
    { id: "foo", available: true, context_length: 12345 },
  ]);
  assert.equal(out.foo.limit.context, 12345);
  assert.equal(out.foo.limit.output, 65536);
});

test("falls back to 1M context when context_length is missing, 0, or NaN", () => {
  assert.equal(
    discoverModels([{ id: "a", available: true }]).a.limit.context,
    1048576,
  );
  assert.equal(
    discoverModels([{ id: "a", available: true, context_length: 0 }]).a.limit.context,
    1048576,
  );
  assert.equal(
    discoverModels([{ id: "a", available: true, context_length: "bad" }]).a.limit.context,
    1048576,
  );
});

test("includes virtual auto and fusion models when available", () => {
  const out = discoverModels([
    { id: "auto", available: true, name: "Auto (router picks…)", context_length: 1048576 },
    { id: "fusion", available: true, name: "Fusion (panel…)", context_length: 1048576 },
    { id: "qwen3-coder-480b", available: true, name: "Qwen3 Coder 480B", context_length: 1048576 },
  ]);
  assert.deepEqual(Object.keys(out).sort(), ["auto", "fusion", "qwen3-coder-480b"]);
  assert.equal(out.auto.name, "Auto (router picks…)");
});

test("output limit is always 65536", () => {
  const out = discoverModels([
    { id: "a", available: true, context_length: 1000 },
    { id: "b", available: true, context_length: 999999 },
  ]);
  assert.equal(out.a.limit.output, 65536);
  assert.equal(out.b.limit.output, 65536);
});