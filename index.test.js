import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import plugin from "./index.js";
import * as entry from "./index.js";
import { discoverModels, authFilePath, readStoredKey, toV2Models } from "./lib.js";

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
  assert.equal(out.foo.limit.output, 12345);
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

test("output limit is 65536, capped at the context window", () => {
  const out = discoverModels([
    { id: "a", available: true, context_length: 1000 },
    { id: "b", available: true, context_length: 999999 },
  ]);
  assert.equal(out.a.limit.output, 1000);
  assert.equal(out.b.limit.output, 65536);
});

test("falls back to context_window, then 1M when both are null", () => {
  const out = discoverModels([
    { id: "a", available: true, context_length: null, context_window: 32000 },
    { id: "b", available: true, context_length: null, context_window: null },
  ]);
  assert.equal(out.a.limit.context, 32000);
  assert.equal(out.b.limit.context, 1048576);
});

test("sets tool_call from supported_parameters only when present", () => {
  const out = discoverModels([
    { id: "a", available: true, supported_parameters: ["tools", "temperature"] },
    { id: "b", available: true, supported_parameters: ["temperature"] },
    { id: "auto", available: true },
  ]);
  assert.equal(out.a.tool_call, true);
  assert.equal(out.b.tool_call, false);
  assert.equal("tool_call" in out.auto, false);
});

test("authFilePath follows XDG_DATA_HOME, else ~/.local/share", () => {
  assert.equal(
    authFilePath({ XDG_DATA_HOME: "/data" }, "/home/u"),
    join("/data", "opencode", "auth.json"),
  );
  assert.equal(
    authFilePath({}, "/home/u"),
    join("/home/u", ".local", "share", "opencode", "auth.json"),
  );
});

test("readStoredKey reads only an api-type freellmapi entry", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fla-"));
  const file = join(dir, "auth.json");
  await writeFile(file, JSON.stringify({ freellmapi: { type: "api", key: "k1" } }));
  assert.equal(await readStoredKey(file), "k1");
  await writeFile(file, JSON.stringify({ freellmapi: { type: "oauth", access: "x" } }));
  assert.equal(await readStoredKey(file), undefined);
  assert.equal(await readStoredKey(join(dir, "missing.json")), undefined);
  await writeFile(file, "not json");
  assert.equal(await readStoredKey(file), undefined);
});

// --- config hook against a fake FreeLLMApi -------------------------------

async function withServer(handler, fn) {
  const server = createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/v1`;
  try {
    return await fn(url);
  } finally {
    server.close();
  }
}

const CATALOG = {
  object: "list",
  data: [
    { id: "auto", name: "Auto", available: true, context_length: 200000 },
    { id: "gone", name: "Gone", available: false, context_length: 8000 },
  ],
};

async function runHook(cfg) {
  const hooks = await plugin.server({});
  await hooks.config(cfg);
  return cfg;
}

test("hook fetches /models?available=true with the configured key", async () => {
  const seen = [];
  await withServer((req, res) => {
    seen.push({ url: req.url, auth: req.headers.authorization });
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(CATALOG));
  }, async (url) => {
    const cfg = await runHook({
      provider: { freellmapi: { options: { baseURL: url + "/", apiKey: "cfg-key" }, models: {} } },
    });
    assert.deepEqual(Object.keys(cfg.provider.freellmapi.models), ["auto"]);
  });
  assert.deepEqual(seen, [{ url: "/v1/models?available=true", auth: "Bearer cfg-key" }]);
});

test("hook falls back to the key in opencode's auth.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "fla-"));
  await mkdir(join(dir, "opencode"));
  await writeFile(
    join(dir, "opencode", "auth.json"),
    JSON.stringify({ freellmapi: { type: "api", key: "stored-key" } }),
  );
  const saved = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = dir;
  let auth;
  try {
    await withServer((req, res) => {
      auth = req.headers.authorization;
      res.end(JSON.stringify(CATALOG));
    }, async (url) => {
      const cfg = await runHook({ provider: { freellmapi: { options: { baseURL: url } } } });
      assert.ok(cfg.provider.freellmapi.models.auto);
    });
  } finally {
    if (saved === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = saved;
  }
  assert.equal(auth, "Bearer stored-key");
});

test("hook leaves config alone on errors or an empty list", async () => {
  const existing = { keep: { name: "Keep" } };
  for (const handler of [
    (_q, res) => { res.statusCode = 401; res.end("{}"); },
    (_q, res) => res.end("not json"),
    (_q, res) => res.end(JSON.stringify({ data: [] })),
  ]) {
    await withServer(handler, async (url) => {
      const cfg = await runHook({
        provider: { freellmapi: { options: { baseURL: url, apiKey: "k" }, models: { ...existing } } },
      });
      assert.deepEqual(cfg.provider.freellmapi.models, existing);
    });
  }
  // Unreachable server and no provider entry: no throw, no change.
  const cfg = await runHook({
    provider: { freellmapi: { options: { baseURL: "http://127.0.0.1:1/v1", apiKey: "k" }, models: { ...existing } } },
  });
  assert.deepEqual(cfg.provider.freellmapi.models, existing);
  assert.deepEqual(await runHook({}), {});
});
// --- module shape and opencode v2 ---------------------------------------

test("entry exports only a default plugin object usable by v1 and v2", () => {
  assert.deepEqual(Object.keys(entry), ["default"]);
  assert.equal(typeof plugin.id, "string");
  assert.equal(typeof plugin.server, "function");
  assert.equal(typeof plugin.setup, "function");
});

test("toV2Models builds full Model.Info entries", () => {
  const [m] = toV2Models(
    discoverModels([{ id: "q", name: "Q", available: true, context_length: 1000, supported_parameters: [] }]),
  );
  assert.deepEqual(m, {
    id: "q", modelID: "q", providerID: "freellmapi", name: "Q",
    capabilities: { tools: false, input: ["text"], output: ["text"] },
    variants: [], time: { released: 0 }, cost: [], status: "active", enabled: true,
    limit: { context: 1000, output: 1000 },
  });
  assert.equal(toV2Models(discoverModels([{ id: "auto", available: true }]))[0].capabilities.tools, true);
});

function fakeV2Context(options) {
  const calls = [];
  return {
    calls,
    ctx: {
      options,
      provider: {
        transform: async (cb) => {
          cb({ models: { set: (id, models) => calls.push({ id, models }) } });
          return { dispose: async () => {} };
        },
      },
    },
  };
}

test("v2 setup sets models from plugin options", async () => {
  await withServer((req, res) => {
    assert.equal(req.headers.authorization, "Bearer opt-key");
    res.end(JSON.stringify(CATALOG));
  }, async (url) => {
    const { ctx, calls } = fakeV2Context({ baseURL: url, apiKey: "opt-key" });
    await plugin.setup(ctx);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].id, "freellmapi");
    assert.deepEqual(calls[0].models.map((m) => m.id), ["auto"]);
  });
});

test("v2 setup does nothing when the server fails", async () => {
  await withServer((_q, res) => { res.statusCode = 500; res.end(); }, async (url) => {
    const { ctx, calls } = fakeV2Context({ baseURL: url, apiKey: "k" });
    await plugin.setup(ctx);
    assert.equal(calls.length, 0);
  });
});
