# CONTEXT.md 格式

## 结构

```md
# {上下文名称}

{用一两句话描述这个上下文是什么、为什么存在。}

## 术语

**Order(订单)**：
{用一两句话描述该术语}
_避免使用_：Purchase、transaction

**Invoice(发票)**：
交付完成后发送给客户的付款请求。
_避免使用_：Bill、payment request

**Customer(客户)**：
下单的个人或组织。
_避免使用_：Client、buyer、account
```

## 规则

- **要有明确主张。** 当同一概念存在多个词时，挑选最合适的那一个，其余的列在 `_避免使用_` 下。
- **定义要精炼。** 最多一两句话。定义它"是什么"，而不是它"做什么"。
- **只收录这个项目上下文中特有的术语。** 通用编程概念（超时、错误类型、工具模式）不属于此处，即便项目大量使用它们也是如此。在添加一个术语之前，先问：这是这个上下文特有的概念，还是一个通用编程概念？只有前者才该收录。
- **当出现自然的术语簇时，用子标题将其分组。** 如果所有术语都属于同一个内聚的领域，扁平列表即可。

## 单上下文仓库 vs 多上下文仓库

**单上下文（大多数仓库）：** 仓库根目录放一个 `CONTEXT.md`。

**多上下文：** 仓库根目录放一个 `CONTEXT-MAP.md`，列出各个上下文、它们位于何处，以及它们之间如何关联：

```md
# 上下文地图

## 上下文

- [Ordering](./src/ordering/CONTEXT.md) — 接收并跟踪客户订单
- [Billing](./src/billing/CONTEXT.md) — 生成发票并处理付款
- [Fulfillment](./src/fulfillment/CONTEXT.md) — 管理仓库拣货与发货

## 关联关系

- **Ordering → Fulfillment**：Ordering 发出 `OrderPlaced` 事件；Fulfillment 消费这些事件以开始拣货
- **Fulfillment → Billing**：Fulfillment 发出 `ShipmentDispatched` 事件；Billing 消费这些事件以生成发票
- **Ordering ↔ Billing**：共享 `CustomerId` 和 `Money` 类型
```

该技能会推断适用哪种结构：

- 如果存在 `CONTEXT-MAP.md`，读取它以找到各个上下文
- 如果只存在根目录的 `CONTEXT.md`，则为单上下文
- 如果两者都不存在，则在首个术语被解析时惰性创建一个根目录的 `CONTEXT.md`

当存在多个上下文时，推断当前主题与哪一个相关。如果不清楚，则询问。
