# opencode-freellmapi

OpenCode plugin that automatically syncs the [FreeLLMApi](https://github.com/tashfeenahmed/freellmapi) model catalog into opencode's model picker at every startup.

## What it does

Adds a `config` hook that:

1. Reads `baseURL` and `apiKey` from your existing `provider.freellmapi` entry in `opencode.json`.
2. Calls `GET {baseURL}/models` with the API key.
3. Filters to entries where `available: true`.
4. Writes the resulting `{id: {name, limit: {context, output}}}` map into `provider.freellmapi.models`.

If FreeLLMApi is unreachable, the plugin does nothing — opencode still starts cleanly.

## Install

In `~/.config/opencode/opencode.json`, add to your `plugin` array:

```json
"plugin": [
  "opencode-freellmapi@git+https://github.com/<your-username>/opencode-freellmapi.git"
]
```

## Configure

Your `provider.freellmapi` entry must already exist in `opencode.json` with `options.baseURL` and `options.apiKey`. Minimal example:

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

The `models: {}` map is overwritten by the plugin on every opencode startup. You can leave it empty.

## Run the tests

```bash
npm test
```

## License

MIT