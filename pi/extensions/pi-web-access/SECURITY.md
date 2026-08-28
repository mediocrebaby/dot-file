# Security Policy

Please report suspected vulnerabilities through GitHub private vulnerability reporting for this repository. Do not post exploit details, secrets, or proof-of-concept payloads in public issues or pull requests.

If private vulnerability reporting is unavailable for your account or this repository, open a minimal public issue asking for a private contact path without including technical details.

## OpenAI Web Search endpoints

OpenAI Web Search sends credentials only to the configured Responses endpoint. HTTPS endpoints undergo strict public IPv4/IPv6 DNS validation, then the Node transport pins the connection to a validated address to prevent DNS rebinding; plain HTTP is restricted to canonical literal loopback addresses (`127.0.0.0/8` and `::1`) for local CLIProxyAPI use. Endpoint URLs may not contain userinfo, query parameters, fragments, encoded path traversal, or unsafe path separators. Redirects are not followed.

Provider endpoint validation intentionally does not inherit `ssrf.allowRanges` or `ssrf.trustEnvProxy`, because those options are scoped to content fetching and must not widen where OpenAI credentials can be sent. Extra OpenAI request headers are allowlisted to `OpenAI-Organization`, `OpenAI-Project`, and `X-OpenAI-Actor-Authorization`; callers cannot override `Authorization`, forwarding headers, cookies, host, or content length.

API keys and controlled header values support the extension's credential-source syntax and are resolved at request time. Provider error bodies are bounded and redacted before they can reach search results, storage, curator state, or logs. Protect `web-search.json`, use absolute trusted credential commands, and treat a CLIProxyAPI access token as a secret.
