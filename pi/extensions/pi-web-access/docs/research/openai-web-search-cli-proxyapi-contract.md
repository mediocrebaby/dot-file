# OpenAI 与 CLIProxyAPI Responses Web Search 契约验证

日期：2026-08-28

## 执行状态

本次完成文档、源码和版本研究，未进行真实 OpenAI 或 CLIProxyAPI 搜索请求：

- 未发现可执行的 CLIProxyAPI 本地命令或运行进程。
- `http://127.0.0.1:8317/v1/models` 探测超时。
- 当前环境没有可安全使用的已知凭据。
- 未打印、读取或写入任何密钥。

因此，下文“已确认”仅表示官方文档、源码或版本信息已核对，不表示真实端到端兼容性认证。

## 基线

### OpenAI 直连

- Endpoint：`POST https://api.openai.com/v1/responses`
- 鉴权：`Authorization: Bearer <OPENAI_API_KEY>`
- 内容类型：`Content-Type: application/json`
- 当前官方示例模型：`gpt-5.6`
- 工具：`{"type":"web_search"}`
- `web_search_preview` 仍用于旧集成，但不支持较新的搜索控制项。

### CLIProxyAPI 候选基线

- 版本：`v7.2.144`
- 发布日期：2026-08-27
- 本地地址示例：`http://127.0.0.1:8317/v1`
- 协议：`wire_api = "responses"`
- 路径：`POST /v1/responses`
- Codex OAuth 示例模型：`gpt-5.6-sol`
- 风险对照模型：`gpt-5.5`
- 状态：候选测试基线，尚未通过真实请求认证。

CLIProxyAPI 官方资料声称支持 OpenAI Responses、非流式响应和 tools，但没有提供完整的 `web_search` 兼容矩阵。

## 对照矩阵

| 契约项 | OpenAI 直连 | CLIProxyAPI v7.2.144 | 状态 |
|---|---|---|---|
| `POST /v1/responses` | 官方文档明确 | `internal/api/server_routes.go` 明确注册 | 源码/文档已确认 |
| 非流式响应 | 官方示例省略 `stream`，表示普通 Responses 调用 | README 声称支持非流式 | 未做真实请求 |
| `tools:[{type:"web_search"}]` | 官方推荐的新路径 | README 声称 tools 支持；未见 native OpenAI web_search 完整契约 | OpenAI 文档已确认，代理未知 |
| `web_search_preview` | 旧兼容路径；不支持新控制项 | 代理是否保留字段未知 | 未知 |
| `include:["web_search_call.action.sources"]` | 官方明确支持 | 是否透传或翻译未知 | OpenAI 文档已确认，代理未知 |
| URL citation | `url_citation`，含 `start_index`、`end_index`、`url`、`title` | Issue #5236 证明某些翻译路径曾返回 citation 但丢失 `web_search_call` | 代理存在高风险 |
| 完整来源 URL | 通过 `action.sources` 返回模型查阅的完整 URL 列表 | 当前源码未证明 native OpenAI 路径完整保留 | 未知 |
| `filters.allowed_domains` | 支持，最多 100 个域名；不带协议前缀 | 是否接受或透传未知 | OpenAI 文档已确认 |
| `filters.blocked_domains` | Web Search 指南明确支持，最多 100 个 | 是否接受或透传未知 | OpenAI 文档已确认，代理未知 |
| `search_context_size` | `low`、`medium`、`high` | 未知 | OpenAI 文档已确认 |
| `external_web_access` | 默认 `true`；`false` 表示缓存/离线模式 | 未知 | OpenAI 文档已确认 |
| `user_location` | 支持 approximate country/city/region/timezone | 未知 | OpenAI 文档已确认 |
| `search_content_types` | 支持 `text`、`image`；图像结果需 `include:["web_search_call.results"]` | 未知 | OpenAI 文档已确认 |
| `image_settings` | 支持 `max_results`、`caption` | 未知 | OpenAI 文档已确认 |
| `return_token_budget` | `default`、`unlimited`；仅 GPT-5+ reasoning web search | 未知 | OpenAI 文档已确认 |
| recency/domain 参数 | 当前官方 Responses 文档未定义独立 recency 字段；时间范围只能通过提示词表达 | 未知，不能假设代理会转换 | 高风险未知 |
| `tool_choice:"auto"` | 搜索可选；需 `required` 或指定工具才能强制搜索 | 未知 | OpenAI 文档已确认 |
| API Key 鉴权 | Bearer token | `AuthMiddleware` 委托 access manager；Codex 文档同时示例 Bearer token、`X-OpenAI-Actor-Authorization` 和 `auth.json` | 代理实际头部行为未验证 |
| 无鉴权错误 | 官方错误正文未通过真实请求确认 | middleware 形状为 `{"error":"<message>"}`，状态码由认证错误决定 | 代理源码已确认形状 |
| 上游 HTTP 错误 | 未验证具体 Responses 错误结构 | 是否原样透传或包装，未完整确认 | 未知 |
| 空来源 | 无官方空来源样例 | Claude Responses 翻译代码可生成 `results: []`，但不是 native OpenAI 路径证明 | 部分源码证据 |
| 取消 | 非流式取消后的 HTTP/JSON 形状未记录 | context 取消路径存在，但最终响应形状未验证 | 未知 |

## OpenAI 脱敏响应夹具摘要

以下结构根据官方文档示例整理，不是真实本地捕获：

```json
{
  "output": [
    {
      "type": "web_search_call",
      "id": "ws_REDACTED",
      "status": "completed",
      "action": {
        "type": "search",
        "query": "latest news about AI"
      }
    },
    {
      "id": "msg_REDACTED",
      "type": "message",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "A current answer with a citation.",
          "annotations": [
            {
              "type": "url_citation",
              "start_index": 0,
              "end_index": 42,
              "url": "https://example.invalid/source",
              "title": "Example source"
            }
          ]
        }
      ]
    }
  ]
}
```

请求来源列表时：

```json
{
  "output": [
    {
      "type": "web_search_call",
      "id": "ws_REDACTED",
      "status": "completed",
      "action": {
        "type": "search",
        "query": "example query",
        "sources": [
          {
            "url": "https://example.invalid/source-1"
          }
        ]
      }
    }
  ]
}
```

官方资料明确 `sources` 是完整查阅来源，通常多于最终 citation；来源对象的完整字段集合仍应由真实 JSON 捕获确认。

## CLIProxyAPI 源码夹具摘要

`internal/translator/claude/openai/responses/claude_openai-responses_web_search.go` 表明某条 Claude ↔ Responses 翻译路径会在 `server_tool_use`、`web_search_tool_result` 与 `web_search_call` 之间转换。

已确认的源码行为：

- `web_search_call` ID 使用 `ws_` 前缀。
- 查询可从 `action.query`、`action.queries[0]` 或 `action.url` 读取。
- 结果条目尽量原样保留。
- 空结果可转换为 `results: []`。
- 缺少 Anthropic `encrypted_content` 的条目会被丢弃。
- citation 反向恢复要求 `encrypted_index`，并非所有 OpenAI 原生 URL citation 都可直接重放。

这证明代理存在搜索事件翻译逻辑，但不能证明 Codex/OpenAI native route 会保留所有搜索字段。

## 版本与风险证据

### Issue #4166

CLIProxyAPI 用户报告同一配置下 `gpt-5.5` 可使用 Codex native web search，而 `gpt-5.6-sol` 不调用 native web search，只尝试 shell/curl。问题可能涉及模型能力声明、工具过滤或翻译。

结论：模型别名不能作为能力证明，必须按版本和模型路径实测。

### Issue #5236

报告显示 CLIProxyAPI `v7.2.141` 的 Claude server-side web search 被 Responses 翻译器丢弃；返回 citation annotations，但 `web_search_call` 数量为零。Issue 已关闭并标记 Fixed，`v7.2.144` 源码已出现专门的 web-search 翻译文件及 interleaved-search 测试。

结论：当前源码看似包含修复，但没有真实非流式 native OpenAI 捕获，不能宣称完整兼容。

## 已确认、仅声明与未知

### 已确认

- OpenAI 官方 Responses Web Search 的工具名称、citation 形状、来源列表 include 路径和主要搜索控制项。
- CLIProxyAPI v7.2.144 发布信息。
- CLIProxyAPI `/v1/responses` 路由及认证 middleware 的源码存在。
- CLIProxyAPI 某条 Claude ↔ Responses 翻译路径存在 `web_search_call` 转换。
- 当前环境没有可用的本地 CLIProxyAPI 服务响应。

### 仅由文档或 issue 声称

- CLIProxyAPI 支持 OpenAI Responses、非流式调用和 tools。
- `gpt-5.5` 在某用户配置中可使用 native search。
- v7.2.144 的搜索翻译问题已经完全修复。

### 仍未知

- CLIProxyAPI v7.2.144 + Codex OAuth + `gpt-5.5` 或 `gpt-5.6-sol` 的实际非流式响应。
- `filters`、blocked domains、`search_context_size`、`external_web_access`、`return_token_budget` 是否透传。
- `include` 是否返回完整 `action.sources`。
- 代理是否保留 `web_search_call`、URL citation 的全部字段和顺序。
- 空来源、无 citation、上游 provider error 的 JSON 形状。
- 无 Authorization、错误 Bearer token、`X-OpenAI-Actor-Authorization` 的实际状态码和优先级。
- 非流式取消后的 HTTP 响应。
- Codex 模型别名与 native search 能力的稳定映射。

## 后续可复现实测步骤

在具备授权环境后固定：

1. CLIProxyAPI 版本：`v7.2.144`
2. Base URL：`http://127.0.0.1:8317/v1`
3. `wire_api = "responses"`
4. 分别测试 `gpt-5.5` 与 `gpt-5.6-sol`
5. 显式设置 `"stream": false`
6. 使用安全环境变量提供 token；不得 echo、记录或提交 token。

最小请求：

```json
{
  "model": "MODEL_UNDER_TEST",
  "tools": [
    {
      "type": "web_search"
    }
  ],
  "tool_choice": "required",
  "input": "Search the web for the current stable Go release and cite the source.",
  "stream": false
}
```

随后逐项增加：

- `include: ["web_search_call.action.sources"]`
- `filters.allowed_domains`
- `filters.blocked_domains`
- `search_context_size`
- `external_web_access`
- `user_location`
- `return_token_budget`

另测：缺失或无效 Authorization、不存在模型、`web_search_preview`、无匹配域名、无可用来源以及客户端超时/取消。

所有响应只保留脱敏后的状态码、顶层键、事件类型、URL 主机名和错误类别。

## 来源

- OpenAI Web Search Guide: https://developers.openai.com/api/docs/guides/tools-web-search
- OpenAI Responses API Reference: https://developers.openai.com/api/docs/api-reference/responses
- CLIProxyAPI README: https://github.com/router-for-me/CLIProxyAPI
- CLIProxyAPI v7.2.144 Release: https://github.com/router-for-me/CLIProxyAPI/releases/tag/v7.2.144
- CLIProxyAPI Codex configuration: https://help.router-for.me/agent-client/codex
- CLIProxyAPI response routes: https://github.com/router-for-me/CLIProxyAPI/blob/v7.2.144/internal/api/server_routes.go
- CLIProxyAPI auth middleware: https://github.com/router-for-me/CLIProxyAPI/blob/v7.2.144/internal/api/server_middleware.go
- CLIProxyAPI web-search translator: https://github.com/router-for-me/CLIProxyAPI/blob/v7.2.144/internal/translator/claude/openai/responses/claude_openai-responses_web_search.go
- Issue #4166: https://github.com/router-for-me/CLIProxyAPI/issues/4166
- Issue #5236: https://github.com/router-for-me/CLIProxyAPI/issues/5236
