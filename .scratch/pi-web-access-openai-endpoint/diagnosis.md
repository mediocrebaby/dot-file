# OpenAI 搜索端点地址校验：诊断与决策

## 目标与用户决策

恢复 `cpa.bshwk.dpdns.org` 的 OpenAI 搜索通道，不以切换 DuckDuckGo 或修改系统 DNS 作为解决方案。

用户已确认：

1. 通过插件兼容现有网络。
2. 兼容默认生效，不新增 `allowFakeIp` 或其他配置开关。
3. OpenAI 搜索与内容抓取统一支持，避免同一网络下行为不一致。
4. 默认例外仅针对域名解析到 `198.18.0.0/15`；直接 IP URL 及其他原先禁止的地址仍按原规则处理。

实现、回归测试、独立审查和最终变更核对已完成。已安装扩展目录通过符号链接指向本仓库；重启 Pi 后加载新实现。

## 根因与复现

- Windows 与 Node DNS 均将域名解析为 `198.18.0.64`，属于 `198.18.0.0/15`。
- 原 OpenAI 与通用内容抓取校验均拒绝该保留池，错误发生在 HTTP 请求及鉴权发出之前。
- OpenAI 不继承 `ssrf.allowRanges` / `ssrf.trustEnvProxy` 是既有隔离设计；并非通用配置读取失败。
- 原始只读调查运行 ID：`1f42659e-2adf-4661-b1be-1521fb90e752`。
- 连接与配置路径核对运行 ID：`cb53c47f-b54a-4e26-9bc2-aa42afe226cf`。其针对显式开关的建议已由后续用户决定撤回，不属于最终设计。

在 `pi/extensions/pi-web-access` 下，修复前运行：

```powershell
node --test --test-name-pattern='fake-IP' test/openai-web-search.test.ts test/ssrf-protection.test.ts
```

结果：9 个匹配测试，7 个失败、2 个通过。OpenAI 失败包含原 `resolved to a private or reserved address` 错误；内容抓取失败包含 `Blocked internal address` 和已过时的配置提示。

## 实现边界

- 共用 `isFakeIpProxyAddress`，仅识别有效 IPv4 `198.18.0.0/15`。
- 仅在域名 DNS 结果遍历中加入例外；直接 IP URL 仍走原地址保护。
- 对全部 DNS 结果逐项校验，fake-IP 与其他禁止地址混合时仍拒绝。
- OpenAI 继续保留原域名 TLS SNI/证书校验、已校验地址固定和禁止重定向；不继承通用 SSRF 自定义豁免。
- 内容抓取沿用域名策略与逐次重定向校验。Firecrawl 的目标和服务端点也沿用该通用校验。
- 已有显式 `ssrf.allowRanges` 语义不变，包括对直接 IP URL 的作用；新默认行为不依赖它。
- 可选 OpenAI 契约探针同步默认例外；本次未运行任何付费搜索请求。

架构取舍与原安全边界的调整见 [ADR 0001](../../docs/adr/0001-default-fake-ip-compatibility.md)。README、安全说明和原边界决策同步说明新默认行为。

## 验证

修复后在扩展目录运行：

```powershell
node --test
./node_modules/.bin/tsc.cmd --noEmit
node --check evidence/openai-web-search-contract-probe.mjs
```

结果：41 个测试全部通过；TypeScript 和探针语法检查通过。覆盖 OpenAI 搜索请求、固定 lookup、`extractContent` 内容提取入口、通用校验/重定向、混合 DNS 拒绝、直接 IP 拒绝以及既有 CIDR 豁免保留。

使用系统 DNS 再次验证原域名，OpenAI 与内容抓取均通过校验，地址仍为 `198.18.0.64`。另以原域名和固定地址发送无鉴权 `HEAD /`，得到：

```json
{"unauthenticatedHeadStatus":404,"tlsAuthorized":true,"credentialsSent":false}
```

该结果证明当前网络能连接此 fake-IP，且 TLS 证书校验通过；根路径 404 不影响连接验证。没有验证网关 Responses 鉴权、计费搜索能力或运行中的 Pi 会话是否已重新加载。

独立审查运行 `372e1b14-55e7-4bfd-aa21-804df283ae35` 未发现阻断问题；确认实现、测试、可选探针和文档符合上述边界。最终 `git diff --check` 通过，ADR 链接有效。

## 已知适用条件

DNS 结果本身无法证明具体代理来源。插件默认信任该池的网络映射和转发，不负责生成映射、回查真实公网 IP 或新增 HTTP_PROXY 传输支持。IPv4-mapped IPv6 和其他 fake-IP 池不在本次默认例外范围。
