# opencode-freellmapi

OpenCode plugin that automatically syncs the [FreeLLMApi](https://github.com/tashfeenahmed/freellmapi) model catalog into opencode's model picker at every startup.

Works with both opencode lines:

- **opencode v1** (`opencode-ai` on npm)
- **opencode v2** (`@opencode/cli` on npm)

## What it does

At startup the plugin:

1. Finds your FreeLLMApi address and API key (see [Where the URL and key come from](#where-the-url-and-key-come-from)).
2. Calls `GET {baseURL}/models?available=true` with the key.
3. Keeps the entries marked `available: true`.
4. Adds them as models of the `freellmapi` provider, with each model's context window and whether it supports tool calls.

If FreeLLMApi is unreachable, rejects the key or returns no models, the plugin does nothing and opencode starts with the models it already had.

## Install

Add the plugin to the `plugin` array in `~/.config/opencode/opencode.json`:

```json
"plugin": [
  "opencode-freellmapi@git+https://github.com/racstan/opencode-freellmapi.git"
]
```

## Configure

### opencode v1

You need a `provider.freellmapi` entry. FreeLLMApi's own **Connect → OpenCode** writes one for you, and it stores the key in opencode's credential store instead of in `opencode.json`. The plugin reads it from there. A minimal hand-written entry:

```json
{
  "provider": {
    "freellmapi": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "FreeLLMAPI",
      "options": {
        "baseURL": "http://127.0.0.1:3001/v1",
        "apiKey": "freellmapi-your-key-here"
      },
      "models": {}
    }
  }
}
```

`apiKey` can be left out if the key is saved with `/connect` (or by FreeLLMApi's Connect). The plugin overwrites the `models` map on every startup, so you can leave it empty.

### opencode v2

v2 uses `providers` (plural) with `settings` in place of `options`:

```json
{
  "plugin": [
    ["opencode-freellmapi@git+https://github.com/racstan/opencode-freellmapi.git",
     { "baseURL": "http://127.0.0.1:3001/v1" }]
  ],
  "providers": {
    "freellmapi": {
      "name": "FreeLLMAPI",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "http://127.0.0.1:3001/v1",
        "apiKey": "freellmapi-your-key-here"
      }
    }
  }
}
```

opencode v2 doesn't let a plugin read a provider's `settings`, so give the plugin the URL and key separately: as plugin options (shown above, add `"apiKey"` there too if needed) or through the environment variables below. If your FreeLLMApi runs on the default `http://127.0.0.1:3001/v1`, you can skip the URL.

### Where the URL and key come from

The plugin uses the first value it finds.

| | Base URL | API key |
|---|---|---|
| 1 | `provider.freellmapi.options.baseURL` (v1 only) | `provider.freellmapi.options.apiKey` (v1 only) |
| 2 | plugin option `baseURL` | plugin option `apiKey` |
| 3 | `FREELLMAPI_BASE_URL` | the `freellmapi` key in opencode's `auth.json` (`$XDG_DATA_HOME/opencode`, else `~/.local/share/opencode`, Windows too) |
| 4 | `http://127.0.0.1:3001/v1` | `FREELLMAPI_API_KEY` |

## Run the tests

```bash
npm test
```

## License

MIT
