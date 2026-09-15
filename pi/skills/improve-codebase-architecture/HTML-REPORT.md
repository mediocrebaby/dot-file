# 架构审查 HTML 报告

默认输出系统临时目录中的单文件、离线可读 HTML；样式和 SVG 内嵌，不依赖 CDN。只有用户接受联网依赖时才选择 Mermaid/Tailwind CDN，并在报告中说明。语法术语参考 [design.md](references/design.md)，领域名称优先服从项目 CONTEXT。

## 离线骨架

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>架构审查</title>
<style>
body { margin:0; background:#f8fafc; color:#0f172a; font:16px/1.65 system-ui,sans-serif }
main { max-width:1050px; margin:auto; padding:40px 24px }
article { margin:24px 0; padding:24px; background:white; border:1px solid #cbd5e1; border-radius:12px }
.compare { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:24px }
.module { border:2px solid #334155; padding:16px; border-radius:6px }
.seam { stroke-dasharray:4 4 }
.leak { stroke:#dc2626 }
.warning { border-left:4px solid #d97706; padding-left:12px }
code { overflow-wrap:anywhere }
</style>
</head>
<body><main>
<header><h1>架构审查：项目名称</h1><p>日期、审查范围及图例</p></header>
<section id="candidates"><!-- 每个真实候选一个 article --></section>
<section id="recommendation"><h2>优先建议</h2><!-- 建议与具体取舍 --></section>
</main></body>
</html>
```

## 每个候选必须讲清

- 名称与建议强度：强烈建议 / 值得验证 / 推测。
- 涉及文件和真实观察到的问题，不凭目录外观断言架构差。
- 并列的 Before / After 图：调用链、状态流、层次或接口宽度，按主题选一种。
- 方案、收益、代价与验证方式；未测量不宣称提升百分比。
- 若冲突现行 ADR/Note，链接记录并说明哪项前提变化值得重访。

常用图形：内嵌 SVG 的盒与箭头、层次带、调用树折叠、接口/内部复杂性的面积对照。图不能独立传达时补简短说明，不为了形式删除必要条件。

## 安全与可读性

项目名、文件名和读取的文档内容作为文本转义，不直接拼入可执行 HTML/脚本。默认报告只展示，不执行 app 代码、不包含敏感日志。可选 Mermaid 使用 strict 安全模式，外部资源不可用时仍保留文字内容。

结尾选一个优先候选，说明为何先做与代价，并询问用户要探索哪个；报告交付不等于授权重构。保存后至少检查生成路径、HTML 内容与打开方式；没有浏览器实测时如实注明。Windows 路径用实际临时目录，不假设 /tmp。
