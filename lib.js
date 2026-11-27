// Helpers for index.js. Kept out of the plugin entry because opencode v1
// calls every function the entry module exports as a plugin.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export const PROVIDER_ID = "freellmapi";
export const DEFAULT_BASE_URL = "http://127.0.0.1:3001/v1";
const DEFAULT_OUTPUT_LIMIT = 65536;
const DEFAULT_CONTEXT_LIMIT = 1048576;
const FETCH_TIMEOUT_MS = 5000;

/** FreeLLMApi `/models` data → opencode v1 `provider.<id>.models` map. */
export function discoverModels(modelsArray) {
  if (!Array.isArray(modelsArray)) return {};
  const models = {};
  for (const m of modelsArray) {
    if (!m || m.available !== true || typeof m.id !== "string" || !m.id) continue;
    const id = m.id;
    // FreeLLMApi sends both fields (and either may be null for router entries).
    const context =
      Number(m.context_length) || Number(m.context_window) || DEFAULT_CONTEXT_LIMIT;
    const model = {
      name: typeof m.name === "string" && m.name ? m.name : id,
      limit: { context, output: Math.min(DEFAULT_OUTPUT_LIMIT, context) },
    };
    // Only catalog rows carry supported_parameters; router entries (auto,
    // fusion, auto:<chain>) don't, so leave opencode's default for them.
    if (Array.isArray(m.supported_parameters)) {
      model.tool_call = m.supported_parameters.includes("tools");
    }
    models[id] = model;
  }
  return models;
}

/** The v1 map from discoverModels → opencode v2 `Model.Info` list. */
export function toV2Models(models, providerID = PROVIDER_ID) {
  return Object.entries(models).map(([id, m]) => ({
    id,
    modelID: id,
    providerID,
    name: m.name,
    capabilities: { tools: m.tool_call ?? true, input: ["text"], output: ["text"] },
    variants: [],
    time: { released: 0 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context: m.limit.context, output: m.limit.output },
  }));
}

// opencode v1's credential store, written by `/connect` and by FreeLLMApi's
// own "Connect to opencode" (which keeps the key out of opencode.json).
// opencode uses this XDG path on every OS, Windows included.
export function authFilePath(env = process.env, home = homedir()) {
  const dataHome = env.XDG_DATA_HOME?.trim() || join(home, ".local", "share");
  return join(dataHome, "opencode", "auth.json");
}

export async function readStoredKey(file = authFilePath()) {
  try {
    const entry = JSON.parse(await readFile(file, "utf8"))?.[PROVIDER_ID];
    if (entry?.type === "api" && typeof entry.key === "string" && entry.key) return entry.key;
  } catch {
    // Missing or unreadable auth.json: fall through.
  }
  return undefined;
}

const nonEmpty = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** First of: given key, opencode's auth.json, FREELLMAPI_API_KEY. */
export async function resolveApiKey(apiKey) {
  return nonEmpty(apiKey) || (await readStoredKey()) || nonEmpty(process.env.FREELLMAPI_API_KEY);
}

/** First of: given URL, FREELLMAPI_BASE_URL, the FreeLLMApi default. */
export function resolveBaseURL(baseURL) {
  return nonEmpty(baseURL) || nonEmpty(process.env.FREELLMAPI_BASE_URL) || DEFAULT_BASE_URL;
}

/**
 * Fetches the available models as a v1 models map. Returns undefined on any
 * failure or an empty list, so callers keep whatever models they had.
 */
export async function fetchModels({ baseURL, apiKey }) {
  try {
    const key = await resolveApiKey(apiKey);
    if (!key) return undefined;
    const url = `${resolveBaseURL(baseURL).replace(/\/+$/, "")}/models?available=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return undefined;
    const models = discoverModels((await res.json())?.data);
    return Object.keys(models).length ? models : undefined;
  } catch {
    // Never let FreeLLMApi being down break opencode startup.
    return undefined;
  }
}
