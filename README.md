# khoi/pi

Personal Pi package.

Install:

```bash
pi install git:github.com/khoi/pi
pi -e . # to quickly test it out locally
```

This repo uses a `package.json` Pi manifest so one install can expose local Pi resources.

Included resources:

- `extensions/ask_user_question`
- `extensions/minimal-ui`
- `extensions/reload-runtime` — `/reload-runtime` command plus LLM-callable `reload_runtime` tool
- `extensions/system-theme`
- `themes/zenbones-dark.json`
- `themes/zenbones-light.json`

`extensions/system-theme` tracks macOS dark mode and switches between `zenbones-dark` and `zenbones-light`.

`extensions/minimal-ui` reduces UI noise using only public Pi APIs: a compact status footer (directory, git branch, model, context usage, cost, tool success/failure counts, working spinner) and one-line renderers for the built-in read/bash/edit/write/grep/find/ls tools (full output still available via ctrl+o). No prototype patches, no rendered-ANSI rewriting.

Its `bash` tool also accepts `usePTY=true`: the command runs in a PTY (via node-pty + xterm headless, ported from [pi-bash-live-view](https://github.com/lucasmeijer/pi-bash-live-view)) with a live terminal widget while it runs — useful for build systems with rich progress output. Interactive `!`/`!!` commands route through the same PTY path.
