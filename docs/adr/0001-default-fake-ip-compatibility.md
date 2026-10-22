# 网页访问插件默认兼容 Fake-IP 域名解析

`pi-web-access` 原先将 `198.18.0.0/15` 视为保留地址，导致 TUN/fake-IP 网络中的 OpenAI 搜索和内容抓取在发送请求前被拦截。用户选择保留现有网关，不修改系统 DNS，也不增加兼容开关；插件统一默认接受域名 DNS 结果中的该 IPv4 网段，而非要求每个入口单独配置豁免。

例外仅限域名解析结果。直接以该池 IP 作为主机的 URL、IPv4-mapped IPv6 形式及其他原先禁止的地址仍按原规则处理；混合 DNS 结果中的其他禁止地址不会因出现 fake-IP 而被放行。OpenAI 保留 HTTPS 主机名和证书校验、连接地址固定、禁止重定向以及与通用 SSRF 配置的隔离；内容抓取保留域名策略和逐次重定向校验。已有显式 `ssrf.allowRanges` 的含义不变，包括其对直接 IP URL 的作用。

这一决定调整了[原 OpenAI 端点安全边界](../../pi/extensions/pi-web-access/docs/wayfinder/openai-web-search/tickets/03-endpoint-security-boundary.md)中“HTTPS 只接受严格公网解析结果”的约定。代价是默认信任网络对该池的映射与转发：DNS 返回该地址不证明 TUN 代理确实存在，也不提供真实公网地址验证。没有采用默认关闭的开关，因为用户要求零配置和插件入口间一致的使用体验；不扩展到任意私网、其他 fake-IP 池或新增 HTTP 代理传输。
