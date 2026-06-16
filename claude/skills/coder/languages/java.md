# Java 规则

## 权威风格指南

- [Google Java Style Guide](https://google.github.io/styleguide/javaguide.html)
- [Oracle Code Conventions for the Java Programming Language](https://www.oracle.com/java/technologies/javase/codeconventions-contents.html)
- 格式化 / Lint 工具：`google-java-format`、Checkstyle、SpotBugs

## 提炼的核心规则

1. **命名约定**：类 / 接口用 `PascalCase`，方法 / 变量用 `camelCase`，
   常量用 `UPPER_SNAKE_CASE`，包名全小写。
2. **面向接口编程**：声明类型用接口（`List`、`Map`），实现细节（`ArrayList`）只在
   实例化时出现。
3. **善用现代特性**：用 `var`（局部）、`Optional`、Stream API、records、
   增强 switch，避免冗长样板代码。
4. **资源管理**：用 try-with-resources 自动关闭资源，不手写 `finally` 关流。
5. **异常处理**：抛出有意义的具体异常，不吞异常、不捕获宽泛的 `Exception` 后忽略。
6. **不可变优先**：字段尽量 `final`，优先设计不可变对象。
7. **equals/hashCode 成对重写**，并保持一致；用 `Objects.equals` / `Objects.hash`。
8. **避免 null 传递**：用 `Optional` 或显式校验表达「可能不存在」。
