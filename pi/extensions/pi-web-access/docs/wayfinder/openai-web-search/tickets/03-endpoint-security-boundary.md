---
id: WF-OPENAI-WEB-SEARCH-03
title: 确定可配置 API 基址的安全边界
parent: ../map.md
labels:
  - wayfinder:grilling
status: closed
assignee:
blocked_by: []
---

## Question

对显式配置的 OpenAI/CLIProxyAPI 基址，应允许哪些协议、本机和内网地址、端口、路径与重定向；应如何限制跨源跳转、剥离凭据、校验最终目的地并记录脱敏错误，才能支持本地 CLIProxyAPI 又不把通用搜索请求变成 SSRF 或凭据泄露通道？

## Resolution comments

### 2026-08-28 — Endpoint 安全边界已实现

HTTPS 自定义端点必须通过严格的公网 IPv4/IPv6 DNS 校验，并由 Node transport 固定连接到已校验地址，避免请求阶段重新解析造成 DNS rebinding；明文 HTTP 只允许规范四段 `127.0.0.0/8` 或 `::1` literal loopback，用于本机 CLIProxyAPI。拒绝 userinfo、query、fragment、端口 0、路径穿越和编码分隔符；Responses 请求使用 `redirect: "manual"`，任何 3xx 都作为不回退的安全错误。

Provider endpoint 不继承 `ssrf.allowRanges` 或 `ssrf.trustEnvProxy`。额外头仅允许 `OpenAI-Organization`、`OpenAI-Project`、`X-OpenAI-Actor-Authorization`，禁止覆盖 Authorization、Cookie、Host、转发和 hop-by-hop 语义。错误正文有长度上限并按 API Key/受控头值脱敏。
