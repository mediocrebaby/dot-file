# 离线测试

在扩展目录运行，需 Node.js 22.18+、可解析的 `@earendil-works/pi-ai` 和 `jiti`。扩展平时由 Pi 宿主加载，独立运行测试时需自行提供这两个依赖，例如：

```bash
npm install --no-save --package-lock=false @earendil-works/pi-ai@0.87.0 jiti@2.7.0
node --import jiti/register --test tests/*.test.ts
```

已有宿主依赖时可使用本地链接，无需重新安装。`thinking-parser.ts` 使用 TypeScript 参数属性，不能只依赖 Node 的 strip-only 模式。

`stream-errors.test.ts` 使用真实 Pi 事件流类，HTTP 返回全部为明确构造的模拟 SSE；测试在加载 provider 前隔离 HOME，不读取真实账号或更新真实模型缓存。覆盖首帧/中途错误、数字/字符串状态码、JSON 容错、凭证脱敏、DONE/EOF 结束以及用户取消，不代表真实上游兼容性验证。
