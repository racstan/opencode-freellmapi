# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An OpenCode plugin (ES module, no dependencies, no build step) that syncs the [FreeLLMApi](https://github.com/tashfeenahmed/freellmapi) model catalog into opencode's model picker at startup. People install it from the git URL in their opencode `plugin` array, so whatever is on `main` ships straight to users.

## Commands

- Run all tests: `npm test` (Node's built-in runner: `node --test index.test.js`)
- Run one test: `node --test --test-name-pattern="uses provided context_length" index.test.js`

There is no lint or build config.

## Architecture

Supports two incompatible opencode lines from one default export in `index.js`:

- **v1** (`opencode-ai`, plugin types in `@opencode-ai/plugin`) reads `{ id, server }`. `server()` returns a `config` hook that **mutates `cfg.provider.freellmapi.models` in place** (v1 model map: `{ name, limit, tool_call }`).
- **v2** (`@opencode/cli`, SDK `@opencode/plugin`) reads `{ id, setup }`. `setup(ctx)` fetches, then `ctx.provider.transform(editor => editor.models.set("freellmapi", Model.Info[]))`. Config is `providers.<id>.settings`, and a v2 plugin **cannot read a config provider's settings** at setup time (`ctx.provider.get` says "not found"), so v2 gets the URL and key from plugin options, env or `auth.json`.

Rules that are easy to break:

- **`index.js` must export only `default`.** v1's legacy loader calls *every* exported function as a plugin, so helpers live in `lib.js`. A test checks this.
- **Never throw or block startup.** Any fetch, parse or auth failure, or an empty list, returns `undefined` and leaves existing models untouched (5s timeout).
- URL and key lookup order, in `lib.js` `resolveBaseURL`/`resolveApiKey`, is documented in a table in README.md. Keep the two in sync. FreeLLMApi's own "Connect → OpenCode" leaves `apiKey` out of `opencode.json` and stores it in `auth.json` (`$XDG_DATA_HOME/opencode`, else `~/.local/share/opencode`, Windows too), so that fallback matters.
- FreeLLMApi's `/v1/models` source of truth is `server/src/routes/proxy.ts` (`buildCatalogEntries`) in tashfeenahmed/freellmapi. `context_length`/`context_window` can be `null` on router entries (`auto`, `fusion`, `auto:<chain>`), and only catalog rows carry `supported_parameters`.

## Testing against real opencode

Unit tests run the v1 hook and the v2 `setup` against an in-process HTTP server. For an end-to-end check, run a fake `/v1/models` server and a throwaway config:

- Point `XDG_CONFIG_HOME` and `XDG_DATA_HOME` at temp dirs. Use **separate data dirs for v1 and v2**, because they can't share a database. Put the key in `<data>/opencode/auth.json` as `{"freellmapi":{"type":"api","key":"..."}}`.
- Load this repo as a plugin with `file:///<repo dir>`. v2 rejects a path to a single file; it needs a directory.
- v1: `npx opencode-ai@<ver> models freellmapi`. v2: `opencode models --standalone`, because without `--standalone` it uses the shared background service and ignores your env.
