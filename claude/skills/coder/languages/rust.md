# Rust 规则

## 权威风格指南

- [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- [Rust Style Guide](https://doc.rust-lang.org/nightly/style-guide/)
- 格式化 / Lint 工具：`rustfmt`（强制）、`clippy`（强烈建议，处理其告警）

## 提炼的核心规则

1. **命名约定**：类型 / trait / enum 用 `PascalCase`，函数 / 变量 / 模块用
   `snake_case`，常量 / static 用 `UPPER_SNAKE_CASE`。
2. **用 Result 表达可恢复错误**：返回 `Result<T, E>`，用 `?` 传播错误；
   `panic!`/`unwrap`/`expect` 只用于不可恢复或确定不会失败的场景。
3. **借用优先于克隆**：优先传引用（`&T` / `&mut T`），不要为图省事到处 `.clone()`。
4. **善用 Option 而非 null**：用 `Option<T>` 表达「可能不存在」，配合 `match` /
   `if let` / 组合子（`map`、`and_then`、`unwrap_or`）处理。
5. **迭代器优先**：用迭代器适配器（`map`、`filter`、`collect`）替代手写索引循环。
6. **善用所有权与生命周期**：让类型系统表达约束，避免不必要的 `unsafe`；
   必须用 `unsafe` 时注释说明为何安全。
7. **错误类型**：库用具体错误类型（可配合 `thiserror`），应用层可用 `anyhow`。
8. **处理 clippy 告警**：把 clippy 的建议当作默认规则执行。
