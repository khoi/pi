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

`extensions/minimal-ui` reduces UI noise using only public Pi APIs: a status widget above the editor (directory, git branch, tool success/failure counts, working spinner), a model/thinking-level widget below, an empty footer, and one-line renderers for the built-in read/bash/edit/write/grep/find/ls tools (full output still available via ctrl+o). No prototype patches, no rendered-ANSI rewriting.
