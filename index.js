const DEFAULT_OUTPUT_LIMIT = 65536;
const DEFAULT_CONTEXT_LIMIT = 1048576;
const FETCH_TIMEOUT_MS = 5000;

export function discoverModels(modelsArray) {
  if (!Array.isArray(modelsArray)) return {};
  const models = {};
  for (const m of modelsArray) {
    if (!m || m.available !== true || typeof m.id !== "string" || !m.id) continue;
    const id = m.id;
    const context = Number(m.context_length) || DEFAULT_CONTEXT_LIMIT;
    models[id] = {
      name: typeof m.name === "string" && m.name ? m.name : id,
      limit: { context, output: DEFAULT_OUTPUT_LIMIT },
    };
  }
  return models;
}

export default async function freellmapiSyncPlugin(_input) {
  return {
    config: async (cfg) => {
      try {
        const provider = cfg?.provider?.freellmapi;
        if (!provider) return;
        const baseURL = provider?.options?.baseURL;
        const apiKey = provider?.options?.apiKey;
        if (typeof baseURL !== "string" || !baseURL) return;
        if (typeof apiKey !== "string" || !apiKey) return;

        const res = await fetch(`${baseURL.replace(/\/+$/, "")}/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) return;

        const body = await res.json();
        provider.models = discoverModels(body?.data);
      } catch {
        // Silent skip — never let FreeLLMApi being down break opencode startup.
      }
    },
  };
}