<p>
  <img src="banner.png" alt="pi-web-access" width="1100">
</p>

# Pi Web Access

**Web search, content extraction, and video understanding for Pi agent. Search prefers OpenAI Responses `web_search` when configured and falls back per query to zero-config DuckDuckGo.**

[![npm version](https://img.shields.io/npm/v/pi-web-access?style=for-the-badge)](https://www.npmjs.com/package/pi-web-access)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows*-blue?style=for-the-badge)]()

https://github.com/user-attachments/assets/cac6a17a-1eeb-4dde-9818-cdf85d8ea98f

## Why Pi Web Access

**Zero Config** — `web_search` works without credentials by falling back to DuckDuckGo's public HTML results page. Add an OpenAI key to make hosted Responses `web_search` the preferred provider.

**Video Understanding** — Point it at a YouTube video or local screen recording and ask questions about what's on screen. Full transcripts, visual descriptions, and frame extraction at exact timestamps.

**Smart Fallbacks** — Content extraction has a fallback chain: configured self-hosted Firecrawl first, then Jina Reader, then Gemini extraction for pages that block bots or fail Readability. YouTube tries Gemini Web when enabled, then Gemini API. Something always works.

**GitHub Cloning** — GitHub URLs are cloned locally instead of scraped. The agent gets real file contents and a local path to explore, not rendered HTML.

## Install

```bash
pi install npm:pi-web-access
```

Works immediately with no API keys: `web_search` uses DuckDuckGo. To prefer OpenAI Web Search, add an OpenAI credential in `~/.pi/web-search.json`; extraction fallbacks (Firecrawl, Gemini) remain independently configurable:

```json
{
  "webSearch": {
    "provider": "auto",
    "openai": {
      "apiKey": "$OPENAI_API_KEY"
    }
  },
  "firecrawlBaseUrl": "https://crawl.example.com",
  "firecrawlApiKey": "fc-...",
  "geminiApiKey": "AIza..."
}
```

`provider: "auto"` and `provider: "openai"` try OpenAI once per query, then silently fall back to DuckDuckGo for eligible failures. Explicit `provider: "duckduckgo"` never contacts OpenAI. Curator summary drafts are generated separately by the configured Pi summary model.

For sandboxed networks that provide outbound proxy transport through environment variables, set `ssrf.trustEnvProxy` to `true` to skip local DNS preflight for proxied hostnames:

```json
{
  "ssrf": {
    "trustEnvProxy": true
  }
}
```

This is an opt-in DNS-preflight adjustment, not proxy transport configuration. `HTTP_PROXY`, `HTTPS_PROXY`, and `ALL_PROXY` are recognized; `NO_PROXY` hosts still undergo DNS validation, and localhost or literal private IP targets remain blocked.

Optional dependencies for video frame extraction:

```bash
brew install ffmpeg   # frame extraction, video thumbnails, local video duration
brew install yt-dlp   # YouTube stream URLs for frame extraction
```

Without these, video content analysis (transcripts, visual descriptions via Gemini) still works. The binaries are only needed for extracting individual frames as images.

Requires Pi v0.37.3+.

## Quick Start

```typescript
// Search the web
web_search({ query: "TypeScript best practices 2025" })

// Fetch a page
fetch_content({ url: "https://docs.example.com/guide" })

// Clone a GitHub repo
fetch_content({ url: "https://github.com/owner/repo" })

// Understand a YouTube video
fetch_content({ url: "https://youtube.com/watch?v=abc", prompt: "What libraries are shown?" })

// Analyze a screen recording
fetch_content({ url: "/path/to/recording.mp4", prompt: "What error appears on screen?" })
```

## Tools

### web_search

Search the web via OpenAI Responses `web_search` when configured, with per-query DuckDuckGo fallback. Returns a synthesized answer with attributable sources.

```typescript
web_search({ query: "rust async programming" })
web_search({ queries: ["query 1", "query 2"] })
web_search({ query: "latest news", numResults: 10, recencyFilter: "week" })
web_search({ query: "...", domainFilter: ["github.com"] })
web_search({ query: "...", includeContent: true })
web_search({ queries: ["query 1", "query 2"], workflow: "none" })
web_search({ queries: ["query 1", "query 2"], workflow: "summary-review" })
web_search({ queries: ["query 1", "query 2"], workflow: "auto-summary" })
```

| Parameter | Description |
|-----------|-------------|
| `query` / `queries` | Single query or batch of queries |
| `numResults` | Results per query (default: 5, max: 20) |
| `recencyFilter` | `day`, `week`, `month`, or `year` |
| `domainFilter` | Limit to domains (prefix with `-` to exclude) |
| `provider` | `auto` (OpenAI → DuckDuckGo), `openai` (same fallback policy), or `duckduckgo` (never contacts OpenAI) |
| `includeContent` | Fetch full page content from sources in background |
| `workflow` | `none` (skip curator), `summary-review` (open curator and auto-generate a summary draft, default), or `auto-summary` (generate a summary without opening the curator) |

### fetch_content

Fetch URL(s) and extract readable content as markdown. Automatically detects and handles GitHub repos, YouTube videos, PDFs, local video files, and regular web pages.

```typescript
fetch_content({ url: "https://example.com/article" })
fetch_content({ urls: ["url1", "url2", "url3"] })
fetch_content({ url: "https://github.com/owner/repo" })
fetch_content({ url: "https://youtube.com/watch?v=abc", prompt: "What libraries are shown?" })
fetch_content({ url: "/path/to/recording.mp4", prompt: "What error appears on screen?" })
fetch_content({ url: "https://youtube.com/watch?v=abc", timestamp: "23:41-25:00", frames: 4 })
```

| Parameter | Description |
|-----------|-------------|
| `url` / `urls` | Single URL/path or multiple URLs |
| `prompt` | Question to ask about a YouTube video or local video file |
| `timestamp` | Extract frame(s) — single (`"23:41"`), range (`"23:41-25:00"`), or seconds (`"85"`) |
| `frames` | Number of frames to extract (max 12) |
| `forceClone` | Clone GitHub repos that exceed the 350MB size threshold |

### get_search_content

Retrieve stored content from previous searches or fetches. Fetched URL content is stored in full, but `get_search_content` returns bounded slices by default so large pages do not overflow the next model request. Use `offset` and `limit` to page through long content intentionally.

```typescript
get_search_content({ responseId: "abc123", urlIndex: 0 })
get_search_content({ responseId: "abc123", url: "https://...", offset: 30000 })
get_search_content({ responseId: "abc123", query: "original query" })
```

### source_check

Check a claim and return a machine-readable artifact with exact passage citations. Search results are deduplicated and capped at 20 sources; `fetchContent` fetches at most 5 pages, while stored and retrieved content remains subject to the existing 30,000-character `offset`/`limit` bounds.

```typescript
source_check({ claim: "The API supports streaming responses" })
source_check({
  claim: "The API supports streaming responses",
  queries: ["API streaming responses documentation", "API streaming limitations"],
  fetchContent: true,
  domainFilter: ["docs.example.com", "-old.example.com"]
})
```

The artifact includes `supported`, `contradicted`, `unclear`, or `missing-evidence` claim status, source quality hints, SHA-256 content hashes, and passage IDs with exact source offsets. Search and fetch errors remain in the artifact instead of being silently discarded. Artifacts are stored with the session and retrieved through `get_search_content` using the returned `responseId`; paged artifact responses are JSON slices, so request the next `offset` when needed.

## Capabilities

### GitHub repos

GitHub URLs are cloned locally instead of scraped. The agent gets real file contents and a local path to explore with `read` and `bash`. Root URLs return the repo tree + README, `/tree/` paths return directory listings, `/blob/` paths return file contents.

Repos over 350MB get a lightweight API-based view instead of a full clone (override with `forceClone: true`). Commit SHA URLs are handled via the API. Clones are cached for the session and wiped on session change. Private repos require the `gh` CLI. Set `githubClone.enabled` to `false` to skip this GitHub-specific clone/API handling; `fetch_content` remains available, so the URL can continue through the normal HTTP extraction path.

### YouTube videos

YouTube URLs are processed via Gemini for full video understanding — visual descriptions, transcripts with timestamps, and chapter markers. Pass a `prompt` to ask specific questions about the video. Results include the video thumbnail so the agent gets visual context alongside the transcript.

Fallback: Gemini Web when browser cookies are enabled → Gemini API. Handles all URL formats: `/watch?v=`, `youtu.be/`, `/shorts/`, `/live/`, `/embed/`, `/v/`.

### Local video files

Pass a file path (`/`, `./`, `../`, or `file://` prefix) to analyze video content via Gemini. Supports MP4, MOV, WebM, AVI, and other common formats up to 50MB for Gemini analysis. Pass a `prompt` to ask about specific content. If ffmpeg is installed, a thumbnail frame is included alongside the analysis. Timestamp/frame extraction uses ffmpeg directly and can still operate on larger local files.

Fallback: Gemini API (Files API upload) → Gemini Web when browser cookies are enabled.

### Video frame extraction

Use `timestamp` and/or `frames` on any YouTube URL or local video file to extract visual frames as images.

```typescript
fetch_content({ url: "...", timestamp: "23:41" })                       // single frame
fetch_content({ url: "...", timestamp: "23:41-25:00" })                 // range, 6 frames
fetch_content({ url: "...", timestamp: "23:41-25:00", frames: 3 })      // range, custom count
fetch_content({ url: "...", timestamp: "23:41", frames: 5 })            // 5 frames at 5s intervals
fetch_content({ url: "...", frames: 6 })                                // sample whole video
```

Requires `ffmpeg` (and `yt-dlp` for YouTube). Timestamps accept `H:MM:SS`, `MM:SS`, or bare seconds.

### PDFs

PDF URLs are extracted as text and saved to `~/Downloads/` as markdown. The agent can then `read` specific sections without loading the full document into context. Text-based extraction only — no OCR.

### Blocked pages

When Readability fails or returns only a cookie notice, the extension retries configured Firecrawl extraction first, then Jina Reader (handles JS rendering server-side, no API key needed), Gemini URL Context API, and Gemini Web extraction when browser cookies are enabled. Firecrawl requests are cache-only by default and require an explicit fresh-scrape opt-in before the Firecrawl server can fetch target URLs. Handles SPAs, JS-heavy pages, and anti-bot protections transparently. Also parses Next.js RSC flight data when present. HTML extraction also surfaces registered discovery relations (`service-desc`, `service-doc`, `service-meta`, `api-catalog`, `describedby`) from the HTTP `Link` header and matching `link`/`a[rel]` markup. Readable or rendered content remains primary; on an empty shell, the normal extraction fallbacks run before declared links are returned on their own.

## How It Works

```
web_search(query)
  → OpenAI Responses web_search (when configured)
  → eligible failure? DuckDuckGo (HTML scrape, zero-config)

fetch_content(url)
  → Video file?  Gemini API (Files API) → Gemini Web (if browser cookies enabled)
  → GitHub URL?  Clone repo, return file contents + local path
  → YouTube URL? Gemini Web (if browser cookies enabled) → Gemini API
  → HTTP fetch → PDF? Extract text, save to ~/Downloads/
               → HTML? Readability (+ declared Link/rel discovery) → RSC parser → Firecrawl (if configured, cache-only by default) → Jina Reader → Gemini fallback
               → Text/JSON/Markdown? Return directly
```

## Commands

### /websearch

Open the search curator directly. Runs searches and lets you review, add, select results, and approve a summary before it is sent back to the agent — no LLM round-trip needed.

```
/websearch                                               # empty page, type your own searches
/websearch react hooks, next.js caching                  # pre-fill with comma-separated queries
```

Results get injected into the conversation when you approve the summary or click "Send selected results without summary". On timeout, the curator auto-submits and falls back to a deterministic summary if no approved draft is present.

### /curator

Toggle or configure the curator workflow at runtime.

```
/curator                    # toggle on/off
/curator on                 # enable curator (summary-review)
/curator off                # disable curator (raw results only)
/curator summary-review     # explicit workflow
```

Persists to `~/.pi/web-search.json` and takes effect on the next `web_search` call. When disabled, `web_search` returns raw results without opening the curator window.

### /search

Browse stored search results interactively. Lists all results from the current session with their response IDs for easy retrieval.

### /google-account

Show the active Google account currently authenticated for Gemini Web. Useful when multiple Chromium profiles exist or `chromeProfile` is set in config.

## Activity Monitor

Toggle with **Ctrl+Shift+W** to see live request/response activity:

```
─── Web Search Activity ────────────────────────────────────
  API  "typescript best practices"     200    2.1s ✓
  GET  docs.example.com/article        200    0.8s ✓
  GET  blog.example.com/post           404    0.3s ✗
────────────────────────────────────────────────────────────
```

## Configuration

Config defaults to `~/.pi/web-search.json`, or `web-search.json` under `PI_CODING_AGENT_DIR` / `XDG_CONFIG_HOME/pi` when set. Every field is optional.

```json
{
  "firecrawlBaseUrl": "https://crawl.example.com",
  "firecrawlApiKey": "fc-...",
  "firecrawlApiVersion": "v2",
  "firecrawlFreshScrape": false,
  "geminiApiKey": "AIza...",
  "geminiBaseUrl": "https://my-gateway.example.com/gemini",
  "cloudflareApiKey": "...",
  "webSearch": {
    "enabled": true,
    "provider": "auto",
    "openai": {
      "channel": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "$OPENAI_API_KEY",
      "model": "gpt-5.6",
      "timeoutSeconds": 30,
      "searchContextSize": "medium",
      "headers": {
        "OpenAI-Project": "project_..."
      }
    }
  },
  "chromeProfile": "Profile 2",
  "allowBrowserCookies": false,
  "summaryModel": "anthropic/claude-haiku-4-5",
  "workflow": "summary-review",
  "curatorTimeoutSeconds": 20,
  "curatorRemote": {
    "host": "my-box.tailnet.ts.net",
    "bind": "100.101.102.103"
  },
  "autoOpenBrowser": true,
  "githubClone": {
    "enabled": true,
    "maxRepoSizeMB": 350,
    "cloneTimeoutSeconds": 30,
    "clonePath": "/tmp/pi-github-repos"
  },
  "youtube": {
    "enabled": true,
    "preferredModel": "gemini-3.6-flash"
  },
  "video": {
    "enabled": true,
    "preferredModel": "gemini-3.6-flash",
    "maxSizeMB": 50
  },
  "fetchContent": {
    "domainPolicy": {
      "allow": ["example.com"],
      "deny": ["blocked.example.com"]
    }
  },
  "shortcuts": {
    "curate": "ctrl+shift+s",
    "activity": "ctrl+shift+w"
  },
  "ssrf": {
    "allowRanges": ["198.18.0.0/15"],
    "trustEnvProxy": false
  }
}
```

All provider API-key fields (`webSearch.openai.apiKey`, `firecrawlApiKey`, `geminiApiKey`, and `cloudflareApiKey`) accept explicit credential sources. Use `$NAME` or `${NAME}` to read one named environment variable, or prefix a trusted local shell command with `!` to resolve one value at provider request time. Escape `$$` as a literal leading `$` and `$!` as a literal leading `!`:

```json
{
  "webSearch": {
    "openai": {
      "apiKey": "!/absolute/path/to/secret-manager read openai"
    }
  },
  "firecrawlApiKey": "!/absolute/path/to/secret-manager read firecrawl",
  "geminiApiKey": "$!literal-command"
}
```

This syntax applies to provider credentials and the controlled values under `webSearch.openai.headers`; other configuration fields are not interpolated. OpenAI base URLs, models, timeouts, and search context settings are literal configuration.

A command source is not run while the extension loads or registers tools. Each selected provider request runs it again with a five-second timeout, a 16 KiB output limit, a minimized environment, and a one-line non-empty stdout requirement. Command text and stderr are omitted from errors. These commands are trusted local configuration, not a same-user process isolation boundary; use absolute executable paths and protect the config file. `OP_SESSION_*` variables are forwarded to trusted resolver commands so shell-local 1Password sessions can be reused without storing them in config. An explicit source overrides legacy provider environment variables and fails that provider locally rather than falling back with a stale credential. Direct Google Gemini API requests send the resolved key only in the `x-goog-api-key` header, never in the URL.

`fetchContent.domainPolicy` is an optional hostname allow/deny policy for `fetch_content` target URLs. It is off when omitted. Each bare hostname matches itself and its subdomains; `deny` wins when a hostname matches both lists. The policy is checked before HTTP(S) target handling and before each redirect followed by this extension's own fetch path. Local file paths and non-HTTP sources are not subject to this policy. It is an additional restriction: the existing SSRF guard still blocks private and internal destinations. Remote extraction services can still perform their own DNS, redirects, and egress after this extension preflights the submitted target URL, so keep their deployments separately isolated.

Set `firecrawlBaseUrl` or `FIRECRAWL_BASE_URL` to use Firecrawl as an extraction-only fallback for `fetch_content`. It calls `/v2/scrape` by default; set `firecrawlApiVersion` or `FIRECRAWL_API_VERSION` to `v1` for older self-hosted images. Firecrawl requests are cache-only by default (`lockdown: true`), so the Firecrawl server does not make fresh outbound target requests unless you explicitly set `firecrawlFreshScrape: true` or `FIRECRAWL_FRESH_SCRAPE=1`. Enable fresh scraping only for a Firecrawl deployment whose own egress, redirects, DNS rebinding behavior, and internal-network access are isolated or allowlisted; this extension can preflight the submitted URL but cannot control network requests made by the Firecrawl server. The configured Firecrawl API base URL and redirects are still validated by the same SSRF guard as other remote requests, and Firecrawl credentials are stripped from cross-origin API redirects.

Without an explicit `$` or `!` source, `FIRECRAWL_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_GEMINI_BASE_URL`, and `CLOUDFLARE_API_KEY` env vars retain their existing precedence over literal config file values. `GOOGLE_GEMINI_BASE_URL` overrides the Gemini API host for Gemini generate-content calls such as URL context, YouTube, and local video analysis. Set it to a bare host with no trailing slash and no version segment, for example `https://my-gateway.example.com/gemini`; `geminiBaseUrl` is the config-file equivalent. When the configured host contains `gateway.ai.cloudflare.com`, authentication uses `cf-aig-authorization: Bearer <token>` from `CLOUDFLARE_API_KEY` or `cloudflareApiKey`, and `GEMINI_API_KEY` is not required for generate-content calls. Local video file upload still uses Google's Files API directly, so gateway-only video extraction falls back to Gemini Web unless a `GEMINI_API_KEY` is also configured. `webSearch.provider` is the preferred configuration key. Legacy top-level `searchProvider` and `provider` are still read after it for migration compatibility; `searchRouting` remains ignored. Set `webSearch.enabled` to `false` to unregister the configured search and source-check tools while leaving fetch/content tools available. `toolNames` can opt into alternate public tool names for environments where another extension or model reserves the defaults, without changing behavior: `webSearch`, `sourceCheck`, `fetchContent`, and `getSearchContent` default to `web_search`, `source_check`, `fetch_content`, and `get_search_content`. `workflow` sets the default search workflow: `"summary-review"` (default, opens curator with auto-generated summary draft), `"auto-summary"` (returns a model-generated summary without opening the curator), or `"none"` (raw results, no curator). Overridden per-call via the `workflow` parameter on the configured search tool, or toggled at runtime with `/curator`. `chromeProfile` pins Gemini Web cookie lookup to a specific Chromium profile. When omitted, detected Chromium profiles are scanned in stable order and the first profile containing the required Gemini cookies is used. `allowBrowserCookies` enables Chromium cookie extraction for Gemini Web; it defaults to `false` to avoid browser data access and surprise macOS Keychain prompts. You can also set `PI_ALLOW_BROWSER_COOKIES=1`. Cookie databases are copied to a temporary read-only working copy; the reader uses `node:sqlite` when available and otherwise tries the `sqlite3` CLI or Python's standard-library SQLite module. Gemini Web browser-cookie fallback uses its separate `gemini-3.1-pro` default because Gemini Web relies on private header values; explicitly configured unsupported Web models fail instead of silently falling back to 2.5 Flash. `summaryModel` sets the default model used for generating summary drafts in the curator UI and `auto-summary` mode (e.g. `"anthropic/claude-haiku-4-5"`, `"openai-codex/gpt-5.3-codex-spark"`, or `"openrouter/nvidia/nemotron-3-super-120b-a12b:free"`). When Pi `enabledModels` is configured, summaries are limited to that allowlist; if no enabled summary model is available, the tool returns a deterministic summary instead of calling an unrelated model. `curatorTimeoutSeconds` controls the initial curator idle timeout (default `20`, max `600`); users can still adjust the timer in the curator UI. `ssrf.allowRanges` lists CIDR ranges (e.g. `"198.18.0.0/15"`, `"fd00::/8"`) exempted from the SSRF guard that otherwise blocks private/reserved IP ranges. This unblocks `fetch_content` target validation on hosts whose network proxy runs in TUN + fake-IP mode (Surge, Clash, Mihomo, Stash, ...), where public domains resolve into a synthetic reserved range. It is **off by default** — the guard stays fully enabled unless you list ranges here. Use the narrowest range that covers your proxy's fake-IP pool. All-address CIDRs such as `0.0.0.0/0` and `::/0` are rejected. `ssrf.trustEnvProxy` is a separate opt-in for sandboxed environments with valid HTTP(S) proxy env vars; it skips local DNS preflight only for proxied hostnames and still blocks localhost, literal private IPs, and `NO_PROXY` matches. It does not configure proxy transport.

### OpenAI Web Search

OpenAI search uses non-streaming `POST /v1/responses` with the hosted `{ "type": "web_search" }` tool, `tool_choice: "required"`, and complete source inclusion. This is OpenAI Web Search—not a Codex-specific REST API. The default direct model is `gpt-5.6`; model aliases are not treated as capability proof.

Credential precedence is: an explicit `$ENV` or `!command` source in `webSearch.openai.apiKey`, then `PI_WEB_SEARCH_OPENAI_API_KEY`, then `OPENAI_API_KEY`, then a literal configured key. OpenAI search never borrows credentials from Pi's summary-model registry. Base URL and model configuration take precedence over `PI_WEB_SEARCH_OPENAI_BASE_URL` / `PI_WEB_SEARCH_OPENAI_MODEL`; `OPENAI_BASE_URL` is accepted as a compatibility fallback for the base URL.

`numResults` is applied as a client-side source cap. Invalid domain filter entries are rejected before contacting a provider. Valid allowed and blocked domain filters are sent through Responses filters and verified against returned URLs; a mismatch falls back rather than silently weakening the request. Responses has no dedicated recency field, so `recencyFilter` is added to the search prompt as a best-effort recency constraint. `includeContent` still uses this extension's existing content-fetch chain after the actual provider returns sources.

Eligible OpenAI failures—missing credentials, authentication, rate limiting, timeout, network/server errors, unsupported model/tool shapes, malformed Responses output, or no attributable sources—make one DuckDuckGo attempt for that query. There is no automatic OpenAI retry, avoiding duplicate provider charges. Caller cancellation, invalid local parameters, explicit credential-source failures, and endpoint security rejection do not fall back.

CLIProxyAPI uses the same public `openai` provider with an explicit channel, base URL, key, and model:

```json
{
  "webSearch": {
    "provider": "auto",
    "openai": {
      "channel": "cliproxyapi",
      "baseUrl": "http://127.0.0.1:8317/v1",
      "apiKey": "$CLIPROXYAPI_API_KEY",
      "model": "gpt-5.5"
    }
  }
}
```

Plain HTTP is accepted only for canonical literal loopback addresses (`127.0.0.0/8` or `::1`). Public gateways must use HTTPS, pass strict public IPv4/IPv6 DNS validation, and are contacted through a Node transport pinned to a validated address. Redirects are never followed. Allowed extra headers are limited to `OpenAI-Organization`, `OpenAI-Project`, and `X-OpenAI-Actor-Authorization`; their values can use credential-source syntax. CLIProxyAPI `v7.2.144` with `gpt-5.5` / `gpt-5.6-sol` is a candidate compatibility baseline, not a blanket certification—run the optional contract probe before relying on a gateway deployment.

### DuckDuckGo

`web_search` scrapes the unofficial `https://html.duckduckgo.com/html/` no-JS results page — DuckDuckGo does not offer a free official web search API (its Instant Answer API only returns a knowledge panel, not a result list). No API key, account, or configuration is needed; it is always available as the explicit provider and fallback.

`numResults` (default 5, max 20), `recencyFilter` (mapped to DuckDuckGo's `df` day/week/month/year parameter), and `domainFilter` (translated to `site:`/`-site:` query terms, since the endpoint has no dedicated domain parameter) are all supported. The synthesized `answer` is assembled from result snippets, since the HTML endpoint returns no separate answer text.

Because this is an unofficial scraping endpoint with no SLA, DuckDuckGo may still rate-limit or block automated requests (it returns HTTP 202 when doing so). To keep this unlikely, every outgoing request is self-paced at least ~3–4.5s apart (a shared queue, so this covers multiple queries in one call and overlapping calls alike), sent with a randomized desktop browser User-Agent instead of one fixed string, and identical searches (same query, filters, and recency window) are served from a 5-minute in-memory cache instead of re-hitting the endpoint. None of this guarantees DuckDuckGo won't rate-limit — `web_search` still surfaces a clear error in that case — wait a bit and retry.

### Remote curator access

By default the curator HTTP server binds to `127.0.0.1` and hands out a `http://localhost:<port>/?session=<token>` URL, so it is reachable only from the machine running Pi. That is the right default and nothing below changes it unless you opt in.

Opt in when Pi runs somewhere other than where your browser is — a dev box you SSH into, a container, a remote workstation on a Tailscale/WireGuard network:

```json
{
  "curatorRemote": true
}
```

`true` derives both values: the URL host becomes `os.hostname()` and the server binds `0.0.0.0`. Either can be overridden, and you should usually override `bind`:

```json
{
  "curatorRemote": {
    "host": "my-box.tailnet.ts.net",
    "bind": "100.101.102.103"
  }
}
```

| Value | URL host | Bind address |
| --- | --- | --- |
| omitted or `false` | `localhost` | `127.0.0.1` |
| `true` | `os.hostname()` | `0.0.0.0` |
| `{ "host": "h" }` | `h` | `0.0.0.0` |
| `{ "bind": "b" }` | `os.hostname()` | `b` |
| `{ "host": "h", "bind": "b" }` | `h` | `b` |

Anything else — a string, `null`, an array — is treated as not configured and stays local.

`host` only changes the URL that gets printed; `bind` is what actually determines who can reach the server. Set them to a matching pair — a `host` that does not resolve to the interface you bound produces a link that looks right and does not load.

**Security.** Enabling this exposes the curator beyond the local machine, and `bind: "0.0.0.0"` exposes it on every interface, including untrusted networks. The only access control is the unguessable session token in the URL, carried over plain HTTP with no TLS — so the token and everything you curate are readable by anyone able to observe that traffic. Anyone who reaches the port with the token can run searches against your configured providers (spending your API credits) and edit the summary that gets returned into the agent's context. Prefer binding to one private-network interface, as in the example above, over `0.0.0.0`, and treat the curator URL as a secret. The server is short-lived — it exists only for the duration of a curation session — but it is unauthenticated apart from that token.

Remote curator sessions print the URL instead of trying to open a browser by default. Turning remote access on also raises the default curator idle timeout from 20 to 60 seconds, giving you time to notice and click that link; set `curatorTimeoutSeconds` explicitly to override. If you do want Pi to launch a browser on the remote host anyway, set `autoOpenBrowser: true` explicitly.

#### Disabling browser auto-open

`autoOpenBrowser` is also useful on its own for local sessions:

```json
{
  "autoOpenBrowser": false
}
```

When `false`, the extension never tries to open a Glimpse window or a browser and always prints the URL for you to open manually. For local-only sessions it defaults to `true`; remote curator sessions print the URL unless you set `autoOpenBrowser: true` explicitly. This is worth setting locally when you would rather paste the link into a specific browser than have one launched for you. It changes nothing about where the server binds; that is `curatorRemote`'s job alone.

### Shortcuts

Both shortcuts are configurable via `~/.pi/web-search.json`:

```json
{
  "shortcuts": {
    "curate": "ctrl+shift+s",
    "activity": "ctrl+shift+w"
  }
}
```

Values use the same format as pi keybindings (e.g. `ctrl+s`, `ctrl+shift+s`, `alt+r`). Changes take effect on next pi restart.

Set `"enabled": false` under any feature to disable it. For GitHub specifically, `githubClone.enabled: false` only skips clone/API specialization; it does not unregister `fetch_content` or block generic URL extraction. Config changes require a Pi restart.

Rate limits: DuckDuckGo enforces no documented client-side limit, but the unofficial HTML endpoint may throttle or block automated requests without warning. `web_search` self-paces outgoing requests (~3–4.5s apart, shared across concurrent calls), rotates its User-Agent, and caches identical searches for 5 minutes to reduce how often that happens. Content fetches run 3 concurrent with a 30s timeout per URL.

## Limitations

- DuckDuckGo fallback relies on an unofficial HTML scraping endpoint with no SLA; it may rate-limit, block, or change its markup without notice. If OpenAI and DuckDuckGo both fail, the query returns both sanitized attempt failures.
- If the curator cannot open a browser automatically, such as in Docker, WSL, SSH, or headless environments, the running curator URL is shown in the tool output. Copy it into a browser that can reach the Pi host, or use a tunnel/port-forward when needed.
- Chromium cookie extraction for Gemini Web is opt-in via `allowBrowserCookies: true` or `PI_ALLOW_BROWSER_COOKIES=1`; no browser data or password store is touched while it is disabled. On macOS, enabling it may trigger a Keychain dialog. Required cookie names are checked before password-store access, and browser encryption passwords are cached only in-process. If `node:sqlite` is unavailable, the reader falls back to the `sqlite3` CLI or Python stdlib; `/google-account` reports a sanitized SQLite/profile/password diagnostic when extraction fails.
- YouTube private/age-restricted videos may fail on all extraction paths.
- Gemini can process videos up to ~1 hour; longer videos may be truncated.
- PDFs are text-extracted only (no OCR for scanned documents).
- GitHub branch names with slashes may misresolve file paths; the clone still works and the agent can navigate manually.
- Non-code GitHub URLs (issues, PRs, wiki) fall through to normal web extraction.

<details>
<summary>Files</summary>

| File | Purpose |
|------|---------|
| `index.ts` | Extension entry, tool definitions, commands, widget |
| `curator-page.ts` | HTML/CSS/JS generation for the curator UI with markdown rendering |
| `curator-server.ts` | Ephemeral HTTP server with SSE streaming and state machine |
| `summary-review.ts` | Summary prompt construction, model-based draft generation, and deterministic fallback summary |
| `openai-web-search.ts` | OpenAI Responses search config, endpoint security, request contract, and source normalization |
| `duckduckgo.ts` | DuckDuckGo HTML scraping provider and fallback (zero-config) |
| `extract.ts` | URL/file path routing, HTTP extraction, fallback orchestration |
| `search.ts` | Per-query OpenAI → DuckDuckGo routing and actual-provider attribution |
| `gemini-url-context.ts` | Gemini URL Context + Web extraction fallbacks |
| `gemini-web.ts` | Gemini Web client (cookie auth, StreamGenerate) |
| `gemini-web-config.ts` | Gemini Web profile and browser-cookie opt-in config |
| `gemini-api.ts` | Gemini REST API client (generateContent) |
| `chrome-cookies.ts` | macOS/Linux Chromium-based cookie extraction (Keychain/secret-tool + SQLite) |
| `youtube-extract.ts` | YouTube detection, two-tier extraction, frame extraction |
| `video-extract.ts` | Local video detection, Files API upload, Gemini analysis |
| `github-extract.ts` | GitHub URL parsing, clone cache, content generation |
| `github-api.ts` | GitHub API fallback for large repos and commit SHAs |
| `pdf-extract.ts` | PDF text extraction, saves to markdown |
| `rsc-extract.ts` | RSC flight data parser for Next.js pages |
| `utils.ts` | Shared formatting and error helpers |
| `storage.ts` | Session-aware result storage |
| `activity.ts` | Activity tracking for the observability widget |

</details>
