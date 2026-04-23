# openai-native-web-search

Adds a minimal `web_search` tool for Pi when the active model uses the `openai-codex` provider.

How it works:
- registers a synthetic zero-argument `web_search` tool
- enables that tool only for `openai-codex`
- rewrites the outgoing provider payload so OpenAI receives its native `web_search` tool instead of a normal Pi function tool

Limitations:
- Pi does not execute a local `web_search` tool call in this setup
- Pi usually will not show a dedicated `web_search` tool row, query list, or source list
- you typically only see the final assistant answer that used native web search internally
- this extension does not add custom provider logic, search progress rendering, or source extraction

This keeps the implementation small and dependency-free inside this repo.
