# Domain docs

本仓库采用 single-context 布局，所有路径均相对于仓库根目录。

## 探索代码前读取

- `GLOSSARY.md`：本仓库的领域术语。
- `docs/adr/`：读取与当前工作相关的架构决策记录。

文件或目录尚不存在时，直接继续工作，无需提示缺失或提前创建。由 `domain-modeling` 在术语或决策实际明确后按需创建。

## 文档布局

```text
/
├── GLOSSARY.md
└── docs/
    └── adr/
        ├── 0001-<decision-slug>.md
        └── 0002-<decision-slug>.md
```

## 使用术语表中的词汇

任务标题、重构提议、假设和测试名称等涉及领域概念时，使用 `GLOSSARY.md` 定义的术语，避免使用术语表明确排除的同义词。

遇到术语表未收录的概念时，先确认它是否确为项目使用的概念；真实的术语缺口交由 `domain-modeling` 补充。

## 明确指出 ADR 冲突

输出与已有 ADR 冲突时，指出对应 ADR 和重新讨论的理由，再处理决策变更。
