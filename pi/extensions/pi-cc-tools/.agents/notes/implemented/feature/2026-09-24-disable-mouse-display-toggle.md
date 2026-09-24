# Agent Note: 固定禁用鼠标切换工具与思考块展示状态

Status: implemented

## Problem

希望避免鼠标点击改变工具输出和思考块的展开／收起状态，同时保留键盘控制及其他鼠标操作。CHANGELOG.md 曾明确记载保留 Pi 原生思考块点击展开／收起能力；本决定改变这一交互策略，不改写历史记录。

## Decision

pi-cc-tools 启用时，固定禁用工具输出和思考块的鼠标点击展示切换，不提供恢复配置。保留现有键盘快捷键与展示层级语义，以及流式输出、完成时自动收起等非鼠标驱动的展示行为。

实现位于 `extensions/mouse.ts`，由扩展初始化在现有思考块渲染补丁之后安装：

- 工具的 `createResultRegion` 直接返回原组件，不创建用于点击展开的 MouseRegion。
- 思考块每次 `updateContent` 完成后，移除 contentContainer 下直接包裹思考内容的原生 MouseRegion，保留其渲染子组件。
- 不改动全局 MouseRegion、输入分发或键盘 setter，不递归剥离其他组件的鼠标区域，保留子组件自身的鼠标处理。
- 通过原生方法存在性检测兼容无鼠标包装的旧 Pi；补丁可重复安装而不叠加。

README.md 已说明键盘控制与固定禁用鼠标切换的区别；新增模块已加入发布文件清单。

## Alternatives considered

- 仅禁用工具输出的鼠标切换：改动范围更小，但思考块仍可能因点击改变展示状态，用户选择统一禁用两者。
- 默认禁用但允许配置恢复：可兼容偏好鼠标操作的使用者，但增加配置和测试分支；用户明确选择固定禁用。

## Consequences

- 点击不再意外改变展示状态；喜欢通过点击展开详情的使用者必须改用键盘。
- 不通过全局吞掉鼠标事件实现需求，滚动、文本选择等无关操作不被本补丁主动拦截。
- 补丁依赖 Pi 的组件内部结构：当前已确认思考块直接 MouseRegion 包装及工具结果区域工厂。若 Pi 更改入口或在同层引入其他用途的 MouseRegion，需复查局部屏蔽边界，不能直接扩大到全局禁用鼠标。

## Verification

- `npm test`：35 项测试通过，涵盖三档展示逻辑、新增鼠标策略及真实 Pi 组件测试；项目依赖为 Pi 0.79.10。
- `npm run typecheck`：通过。
- `PI_MOUSE_TEST_AGENT_ROOT=/home/linuxbrew/.linuxbrew/lib/node_modules/@earendil-works/pi-coding-agent node --experimental-strip-types --test scripts/mouse.test.ts`：3 项通过，使用本机 Pi 0.87.1；先证实原生点击可改变工具／思考状态，再验证补丁、内容重建、流式标志更新和键盘 setter。
- `scripts/test-render-cache.ts`：在项目依赖及本机 Pi 0.87.1 上均全部通过，包括完整扩展加载、思考块键盘切换、工具分组及渲染缓存。环境没有 Bun，使用 Node registerHooks 加 TypeScript transpileModule 执行；本机版本检查通过 resolve hook 将 Pi 包与主题模块统一指向宿主安装。
- `npm run pack:dry-run`：通过，发布文件包含 `extensions/mouse.ts`；未发布。
- 实体终端中的点击、滚动和文本拖选尚未手工验证；自动测试验证局部包装移除、子组件鼠标处理保留与键盘 setter，不等同于终端端到端验证。
