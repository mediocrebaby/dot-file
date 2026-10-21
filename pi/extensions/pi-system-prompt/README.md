# 系统提示词预览

执行 `/system-prompt`，查看当前系统提示词、扩展提供的注入预览，以及当前激活工具的定义。首次发送消息前即可查看；按 `c` 复制窗口内容。

预览按打开窗口时的配置生成。修改配置后重新打开窗口，即可检查新的内容。

## 扩展通过通用事件提供预览

viewer 在等待空闲、加入环境与日期文本后，同步发布 `system-prompt:preview`：

```ts
interface SystemPromptPreview {
  context: ExtensionCommandContext;
  prompt: string;
}
```

- `context` 是本次命令的上下文，可读取当前模型和会话分支。
- `prompt` 是待显示文本；订阅者可以同步修改它，监听器按注册顺序执行。
- 修改后的同一份文本用于显示、行数字符统计和复制。
- 监听器应只生成预览，不修改会话状态或触发模型请求；异步工作不在此事件协议内。

例如，为预览添加当前会话的一段指令：

```js
pi.events.on('system-prompt:preview', preview => {
  const instructions = getInstructionsForSession(preview.context);
  if (instructions) preview.prompt += `\n\n${instructions}`;
});
```

各扩展自行决定适用条件，并处理自己已存在的指令块，避免重复或展示过期内容。viewer 不读取扩展模板，也不负责决定扩展是否启用。

## 与 gpt-with-taste 一起使用

同时加载两个扩展后，执行 `/reload`，再执行 `/system-prompt`。taste 会按当前会话的开关、角色和模型提供预览；无需先发送模型请求。
