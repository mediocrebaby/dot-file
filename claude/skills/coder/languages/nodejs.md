# Node.js（TypeScript / JavaScript）规则

以 **TypeScript** 为主，JavaScript 同样适用（除类型相关条目外）。

## 权威风格指南

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)
- 格式化 / Lint 工具：`prettier`、`eslint`（配 `typescript-eslint`）、`tsc --strict`

## 提炼的核心规则

1. **命名约定**：变量 / 函数用 `camelCase`，类 / 类型 / 接口用 `PascalCase`，
   常量用 `UPPER_SNAKE_CASE`，文件名随项目约定保持一致。
2. **开启 strict 模式**：`tsconfig` 启用 `strict`，避免 `any`，必要时用 `unknown`
   加收窄；为公共 API 显式标注类型。
3. **const 优先**：默认 `const`，需要重新赋值才用 `let`，禁止 `var`。
4. **异步用 async/await**：用 `async`/`await` 替代回调与裸 Promise 链，
   并对 await 的调用做错误处理（try/catch 或集中处理）。
5. **严格相等**：用 `===` / `!==`，避免 `==` 的隐式类型转换。
6. **善用现代语法**：解构、展开运算符、可选链 `?.`、空值合并 `??`、模板字符串。
7. **不可变优先**：避免直接修改入参与共享对象，用展开 / `map` / `filter` 产生新值。
8. **模块化**：用 ES Module 的 `import`/`export`，按职责拆分模块，避免巨型文件。
9. **错误处理**：抛出 `Error`（或其子类）而非字符串；不忽略 Promise 的 rejection。
