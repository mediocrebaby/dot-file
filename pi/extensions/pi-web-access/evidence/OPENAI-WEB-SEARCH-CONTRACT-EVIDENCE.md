# OpenAI Web Search contract evidence

Status: **live probe pending**

The implementation and automated fixtures cover the documented OpenAI Responses `web_search` contract, citation-only proxy responses, source normalization, domain fidelity, timeout/cancellation, endpoint security, credential redaction, and per-query fallback. They do not certify a live OpenAI account or CLIProxyAPI deployment.

Run `evidence/openai-web-search-contract-probe.mjs` only in an authorized environment. The script writes `evidence/OPENAI-WEB-SEARCH-CONTRACT-EVIDENCE.json` by default and retains only status codes, top-level keys, event types, source/citation hostnames, response status, timings, and bounded redacted errors.

## Direct OpenAI

```bash
OPENAI_WEB_SEARCH_PROBE_API_KEY="$OPENAI_API_KEY" \
OPENAI_WEB_SEARCH_PROBE_MODELS="gpt-5.6" \
node evidence/openai-web-search-contract-probe.mjs
```

## CLIProxyAPI candidate baseline

Fix the deployment to CLIProxyAPI `v7.2.144`, configure its Responses wire path, and run:

```bash
OPENAI_WEB_SEARCH_PROBE_BASE_URL="http://127.0.0.1:8317/v1" \
OPENAI_WEB_SEARCH_PROBE_API_KEY="$CLIPROXYAPI_API_KEY" \
OPENAI_WEB_SEARCH_PROBE_TARGET_VERSION="v7.2.144" \
OPENAI_WEB_SEARCH_PROBE_MODELS="gpt-5.5,gpt-5.6-sol" \
node evidence/openai-web-search-contract-probe.mjs
```

The probe covers:

- non-streaming `/v1/responses` with native `web_search`;
- `include: ["web_search_call.action.sources"]`;
- allowed and blocked domain filters;
- an empty/no-match source case constrained to a reserved non-existent domain;
- missing and invalid authorization;
- client cancellation;
- event, source, citation, and error shapes for each configured model.

The harness pins every request to the DNS address validated before credentials are sent, records the target version and non-streaming Responses wire API, and refuses secret-bearing output. If every baseline model does not return a successful response with complete sources, the run is marked `inconclusive` and exits non-zero; it cannot close the live contract ticket.

A successful result applies only to the exact endpoint deployment and models recorded in the generated evidence. It must not be generalized to every CLIProxyAPI version, translator, upstream provider, or model alias.
