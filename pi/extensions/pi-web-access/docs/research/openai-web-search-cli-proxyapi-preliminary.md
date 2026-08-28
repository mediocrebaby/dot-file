# Preliminary OpenAI Web Search and CLIProxyAPI Research

Date: 2026-08-28

This is a documentary baseline gathered while charting the Wayfinder map. It is not a live compatibility certification.

## Established facts

- OpenAI documents hosted web search through `POST /v1/responses` with a `web_search` tool. Responses can include `web_search_call`, URL citations, and—when requested—source lists.
- OpenAI does not document a stable third-party “Codex search REST API.” Codex CLI/SDK search is a runtime capability layered over its configured provider.
- OpenAI-compatible custom providers can use a Responses wire protocol and a configurable base URL.
- CLIProxyAPI documents OpenAI-compatible Responses, Codex OAuth-backed routing, streaming, and tools, commonly at a local `/v1` base URL.
- CLIProxyAPI issue reports show version- and translator-dependent loss or mutation of native search events. Its broad compatibility claims therefore require a tested baseline rather than an assumption of transparent compatibility.

## Open questions requiring contract verification

- Which CLIProxyAPI version and model route preserve `web_search_call`, URL citations, and complete sources in non-streaming Responses.
- Which authentication headers are required for the selected direct and gateway configurations.
- How domain filters, recency intent, source inclusion, empty results, and provider errors differ between direct OpenAI and CLIProxyAPI.
- Whether runtime capability detection is reliable enough to distinguish unsupported native search from a retryable provider failure.

## Primary sources

- OpenAI Web Search guide: https://developers.openai.com/api/docs/guides/tools-web-search
- OpenAI Responses reference: https://developers.openai.com/api/reference/python/resources/responses
- Codex web search: https://developers.openai.com/codex/web-search
- Codex advanced configuration: https://developers.openai.com/codex/config-file/config-advanced
- Codex authentication: https://developers.openai.com/codex/auth
- Codex Responses proxy: https://github.com/openai/codex/blob/main/codex-rs/responses-api-proxy/README.md
- CLIProxyAPI repository: https://github.com/router-for-me/CLIProxyAPI
- CLIProxyAPI Codex client configuration: https://help.router-for.me/agent-client/codex
- CLIProxyAPI native search issue: https://github.com/router-for-me/CLIProxyAPI/issues/4166
- CLIProxyAPI search translation issue: https://github.com/router-for-me/CLIProxyAPI/issues/5236
- CLIProxyAPI `x_search` conflict issue: https://github.com/router-for-me/CLIProxyAPI/issues/4339
