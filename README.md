# khoi/pi

Personal Pi package.

Install:

```bash
pi install git:github.com/khoi/pi
```

This repo uses a `package.json` Pi manifest so one install can expose local Pi resources.

Included resources:

- `extensions/ask_user_question`
- `extensions/codex-fast-mode`
- `extensions/codex-web-search`
- `extensions/status-line`
- `skills/execplan`
- `themes/zenbones-dark.json`
- `themes/zenbones-light.json`

`extensions/codex-web-search` shells out to the local `codex` CLI for web search and expects an authenticated Codex session. Settings live in `~/.pi/agent/settings.json` under the `"codex-web-search"` key and are managed via `/codex-web-search-settings`.
