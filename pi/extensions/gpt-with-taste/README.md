# GPT with Taste

为当前代理角色注入 Taste 系统指令。默认入口使用 `main` 角色；`sub.js` 和 `independent.js` 是其他角色的显式入口，一个会话只加载一个入口。

## 首次请求前查看注入内容

同时加载 `gpt-with-taste` 和 `pi-system-prompt`，执行 `/reload` 后：

```text
/system-prompt
```

窗口会包含 taste 按当前会话配置将要注入的系统指令，按 `c` 可连同其他提示词和工具定义一起复制。预览不发送模型请求。

```text
/taste off
/system-prompt
/taste on
/system-prompt
```

每次重新打开窗口都会读取当前会话分支的状态和所选模型。关闭 taste 或选择不适用的模型时，预览会移除已有 taste 指令块；启用时只显示一份。会话状态继续通过原有 `gpt-with-taste:state` 记录保存。

默认适用于 provider `openai`、`openai-codex`、`cliproxyapi` 中 ID 以 `gpt-` 开头的模型。`createTasteExtension` 可以自定义适用范围。

`/taste steer off` 只关闭临时 steering 消息，系统指令仍然保留。系统提示词窗口不展示这些非系统消息。

## 联动接口

taste 订阅 `system-prompt:preview`，使用实际注入所用的同一启用判断与内容生成函数。接口约定见 `../pi-system-prompt/README.md`。两个扩展均可独立加载。

## 回归测试

在仓库根目录执行：

```bash
node --test pi/extensions/gpt-with-taste/preview.test.mjs
```

测试加载真实的两个扩展入口，以终端函数替身验证窗口生成和复制，覆盖首轮预览、角色、开关、模型及会话切换。测试使用 Node 内置 TypeScript 转换功能，可能输出实验性功能提示。
