# C# 规则

## 权威风格指南

- [C# Coding Conventions（Microsoft）](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions)
- [.NET Framework Design Guidelines](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/)
- 格式化 / Lint 工具：`dotnet format`、Roslyn 分析器、EditorConfig

## 提炼的核心规则

1. **命名约定**：类型 / 方法 / 属性 / 公共成员用 `PascalCase`，局部变量 / 参数用
   `camelCase`，私有字段用 `_camelCase`，接口以 `I` 前缀（`IDisposable`）。
2. **属性而非公共字段**：用属性（含自动属性）暴露状态，不直接暴露公共字段。
3. **资源释放**：实现 `IDisposable` 的对象用 `using` 声明 / 语句自动释放。
4. **异步规范**：I/O 用 `async`/`await`，异步方法名以 `Async` 结尾，避免
   `async void`（事件处理器除外），避免 `.Result` / `.Wait()` 阻塞。
5. **善用现代特性**：用 `var`（类型明显时）、表达式主体成员、模式匹配、
   可空引用类型（nullable reference types）、`record`、字符串插值。
6. **LINQ 优先**：用 LINQ 表达集合查询与变换，替代冗长循环。
7. **异常处理**：只捕获能处理的具体异常，不吞异常；抛出语义清晰的异常类型。
8. **null 安全**：启用可空引用类型，用 `?.`、`??`、`is null` 显式处理。
