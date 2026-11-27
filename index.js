// opencode plugin entry. Export only the default: opencode v1 treats every
// exported function as a plugin. Helpers live in lib.js.
//
// One object serves both opencode lines:
//   v1 (`opencode-ai`):   reads `id` + `server`, runs the `config` hook.
//   v2 (`@opencode/cli`): reads `id` + `setup`, adds models via provider.transform.
import { PROVIDER_ID, fetchModels, toV2Models } from "./lib.js";

export default {
  id: "opencode-freellmapi",

  // opencode v1: fill `provider.freellmapi.models` in the loaded config.
  server: async (_input, options) => ({
    config: async (cfg) => {
      const provider = cfg?.provider?.[PROVIDER_ID];
      if (!provider) return;
      const models = await fetchModels({
        baseURL: provider.options?.baseURL || options?.baseURL,
        apiKey: provider.options?.apiKey || options?.apiKey,
      });
      if (models) provider.models = models;
    },
  }),

  // opencode v2: plugins can't read a config provider's settings at setup
  // time, so the URL and key come from plugin options, then env / auth.json.
  setup: async (ctx) => {
    try {
      const models = await fetchModels({
        baseURL: ctx?.options?.baseURL,
        apiKey: ctx?.options?.apiKey,
      });
      if (!models) return;
      await ctx.provider.transform((editor) => {
        editor.models.set(PROVIDER_ID, toV2Models(models));
      });
    } catch {
      // Never break opencode startup.
    }
  },
};
