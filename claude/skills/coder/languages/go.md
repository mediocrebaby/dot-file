# Go 规则

## 权威风格指南

- [Effective Go](https://go.dev/doc/effective_go)
- [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments)
- [Google Go Style Guide](https://google.github.io/styleguide/go/)
- 格式化 / Lint 工具：`gofmt` / `goimports`（强制）、`go vet`、`golangci-lint`

## 提炼的核心规则

1. **gofmt 是唯一格式权威**：所有代码必须经 `gofmt` 格式化，不就格式争论。
2. **可见性靠首字母**：导出标识符首字母大写，包内私有首字母小写；命名简短而清晰。
3. **显式错误处理**：函数返回 `error` 作为最后一个返回值，调用处立即检查
   `if err != nil`，不忽略错误；用 `fmt.Errorf("...: %w", err)` 包装上下文。
4. **接口宜小**：接口只定义必要方法，在使用方（消费者）侧定义接口而非实现方。
5. **善用 defer**：用 `defer` 关闭资源 / 解锁，紧跟资源获取之后书写。
6. **零值可用**：设计类型时让零值即可用，减少构造函数需求。
7. **并发安全**：用 channel 或 `sync` 原语保护共享状态，遵循「通过通信共享内存」。
8. **错误信息**：错误字符串小写开头、不带标点，便于被包装拼接。
