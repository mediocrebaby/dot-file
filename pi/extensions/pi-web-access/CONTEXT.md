# Context

## Glossary

### Search provider

A backend that answers a web-search query and returns an answer plus attributable sources through the extension's common search tools.

### OpenAI Web Search

The hosted search capability exposed through OpenAI-compatible Responses semantics. This is the canonical term for this effort; “Codex search API” is not used because no public, stable Codex-specific search API has been established.

### Gateway channel

An explicitly configured intermediary that accepts the same provider contract and forwards or translates the request to an upstream service. CLIProxyAPI is the required gateway channel for this effort.

### Fallback

A second provider attempt for the same query after the preferred provider has an eligible failure.

### Actual provider

The provider that ultimately produced a query result, regardless of which provider was attempted first.
