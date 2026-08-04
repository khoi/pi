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
- `extensions/system-theme`
- `extensions/status-line`
- `themes/zenbones-dark.json`
- `themes/zenbones-light.json`

`extensions/system-theme` tracks macOS dark mode and switches between `zenbones-dark` and `zenbones-light`.
