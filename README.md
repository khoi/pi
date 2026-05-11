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
- `extensions/status-line`
- `@howaboua/pi-codex-conversion`
- `skills/execplan`
- `themes/zenbones-dark.json`
- `themes/zenbones-light.json`

`@howaboua/pi-codex-conversion` replaces the local Codex web-search extension with a Codex-style adapter. On OpenAI GPT/Codex models it swaps in `exec_command`, `write_stdin`, `apply_patch`, native `web_search`, optional native `image_generation`, and `view_image`.
