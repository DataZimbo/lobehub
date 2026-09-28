# Agent Runtime HTTP Hook — 未发布集成草稿

本稿对应集成基线 `50001f8b7e50743c1daa2df35a7b6fa2e90131df`（C2 + S + K + L），不是发布文档。当前实现已接入 allow/deny、完整参数替换与额外上下文，临时控制限制已移除。

实际 HTTP / 设备检查正在进行。D 已观察到改写后的工具参数与 Web 审批卡不一致；现有 Cloud checkout 与集成 OSS 的编译兼容性也阻断了现代审批验证。下文审批 /card 描述是待修复验证的目标契约。真实模型推理和托管 QStash 投递尚缺测试凭据；不得将本稿视为验收通过或已验证的发布指南。

## 从服务端代码注册

Hook 属于一次服务端 Agent operation。可信业务代码通过已有数据库、用户和 Agent 调用 `AiAgentService.execAgent({ hooks })`。`hooks` 是服务端编程选项，不是浏览器请求字段、全局策略、配置文件、环境变量部署开关或管理页面。

```ts
import type { AgentHook } from '@/server/services/agentRuntime/hooks/types';

const hooks: AgentHook[] = [
  {
    id: 'observe-tools',
    type: 'afterToolCall',
    matcher: '^example-tools/',
    webhook: { url: 'https://hooks.example.com/events', timeout: 5 },
  },
  {
    id: 'check-tool',
    type: 'beforeToolCall',
    matcher: '^example-tools/writeFile$',
    webhook: {
      url: 'https://hooks.example.com/check',
      delivery: 'fetch',
      responseHandling: 'toolCall',
      onError: 'block',
      timeout: 5,
      headers: { Authorization: 'Bearer ${HOOK_TEST_TOKEN}' },
      allowedEnvVars: ['HOOK_TEST_TOKEN'],
    },
  },
];
await aiAgentService.execAgent({ agentId, prompt, hooks });
```

`aiAgentService`、`agentId`、`prompt` 由现有服务端集成提供。示例 token 名仅演示显式允许的 header 模板，不新增 Hook 部署配置入口。持久化保存模板，发送时才展开变量，不应记录展开后的凭据。

`matcher` 是作用于组合名称 `${identifier}/${apiName}` 的**字符串正则**。省略、空字符串或 `*` 匹配所有工具，仅可用于 `beforeToolCall`、`afterToolCall`、`onToolCallError`。精确匹配请使用首尾锚点。非法正则或非工具事件 matcher 在注册和恢复时均拒绝。

## 投递方式

| 注册方式               | local 服务端 Runtime | queue 服务端 Runtime           |
| ---------------------- | -------------------- | ------------------------------ |
| 仅 webhook             | 发送 HTTP            | 从持久配置发送 HTTP            |
| handler 和通知 webhook | 调用内存 handler     | 发送 webhook                   |
| 仅 handler             | 调用内存 handler     | 不持久化 handler，不能恢复投递 |

Runtime 模式与 webhook 传输方式是两个选择。`delivery:'fetch'` 为默认值，在 queue Runtime 中也等待 HTTP 响应。`delivery:'qstash'` 向 QStash 发布通知；收到发布确认不代表目标端已收件。QStash 发布失败沿用 fetch fallback，`fallback:'none'` 可禁用此回退。QStash 不用于控制响应。

同步 HTTP 不自动 retry。queue replay 可以再次发出请求，队列传输自身也可能重投。没有 outbox 或 exactly-once 保证。消费者应利用可用的 operation/tool 身份与自身业务规则处理重复；协议不新增 request ID，也不要求响应回传关联 ID。

## 通知在哪些位置增加等待

“仅通知” 描述响应能做什么，不代表 fire-and-forget。以下调用点都会等待 dispatch：

| 位置                                  | 被延迟的动作                                                            |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `beforeCompact`                       | 通知结束后才开始上下文压缩                                              |
| `afterCompact` / `onCompactError`     | 压缩结果 / 错误路径等待通知后返回                                       |
| `beforeCallAgent`                     | 通知结束后才创建 / 启动子 Agent                                         |
| `afterCallAgent` / `onCallAgentError` | 等待通知后返回子运行启动结果 / 错误；不等待子运行完成                   |
| 显式 Stop                             | 先落工具行、确认中断并记录完成，再直接通知；Stop 请求等待 dispatch 返回 |
| continuation `afterHumanIntervention` | 持有 step lock，逐决策组投递并保存剩余列表后，才继续步骤处理            |

`delivery:'fetch'` 在 local 和 queue Runtime 中均等待目标 HTTP 响应及响应体，或等待失败。每个 endpoint 的 `timeout` 独立生效，单位秒，默认 30。匹配的 endpoint 串行投递，因此慢 endpoint 的等待可能累加；该 timeout 不是整个事件的统一预算。选中的本地内存 handler 也会被等待，但 HTTP timeout 不限制 handler 的执行时间。

`delivery:'qstash'` 等待 QStash publish 请求返回，不等待最终目标投递或目标响应。`timeout` 作为目标投递参数传给 QStash，不是 publish 调用的保证截止时间。publish 失败且允许 fetch fallback 时，还会等待一次受 endpoint timeout 限制的直接 HTTP 投递。所有通知响应仍被忽略，deny / 参数改写不能控制这些路径。压缩和子启动通知虽然等待投递，仍保留各自生产者对通知错误的隔离。

## 审批通知可靠性

现代 continuation 将最终决策分组持久化到 host。在现有 step lock 内逐组投递、保存剩余列表，再更新内存；后组失败不重投已完成 checkpoint 的前组。普通投递失败沿 dispatcher 记录并消费该组；`fallback:'none'` 保留失败组并上抛 `CriticalHookDeliveryError`。checkpoint 以 action group 为单位；组内多个 endpoint 部分失败时，已成功的 endpoint 仍可能重投。

HTTP 已送达但 checkpoint 尚未保存时崩溃，可重复投递；checkpoint 完成后的普通 continuation reuse 或替换 worker 不再重发该组。Stop 与旧审批沿直接投递路径：决策 / 终态已持久化但 dispatch 前崩溃可能丢通知，已 terminal 的 Stop 重放不重建通知。通知失败不回滚已完成的 Stop 或决策。不保证送达，不提供 outbox 或跨崩溃 exactly-once；通知响应里的 deny / 参数改写也会被忽略。

## 请求与响应

请求为 JSON POST，携带事件及 `hookId`、`hookType`。工具事件保留 `identifier`、`apiName`、`args`，集成后的生产者还提供原生 `toolCallId`、`originalArgs`、执行来源 / 目标及可用运行关联。可选关联取决于真实 origin，不猜测父 ID。通知兼容已有 `eventFields`/`body`，控制请求禁止裁剪和覆盖载荷。远端不发送 `finalState`。

只有设置 `responseHandling:'toolCall'` 的 `beforeToolCall` webhook 解释下列响应：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "beforeToolCall",
    "permissionDecision": "allow",
    "permissionDecisionReason": "允许本次操作",
    "updatedInput": { "path": "notes/example.txt", "content": "Example" },
    "additionalContext": "本次工具调用使用已批准的目标路径。"
  }
}
```

`permissionDecision` 可选，只接受 `allow` 或 `deny`。`updatedInput` 必须同时带 `allow`，完整替换参数对象。`additionalContext` 可不带权限决定，最多 10000 字符。响应体最多 64 KiB。成功的空响应或 `{}` 表示无决定。非法 JSON、非 2xx、网络错误、超时及不支持的字段属于协议错误。严格 schema 拒绝 `ask`、`defer`、停止整个运行或改写工具输出，不会把它们静默当成已支持。

`timeout` 单位为秒，默认 30。`onError` 默认 `continue`，仅控制模式允许 `block`。控制 Hook 不能同时使用 handler、QStash、eventFields 或 body。通知默认 `responseHandling:'ignore'`，响应不改变运行。URL 服从已有 SSRF 和私网策略；fetch 拒绝重定向，避免更换目的地址时泄露凭据。

## 工具控制与审批 — 待完成验收

控制发生在权限、审批、批量 lane 规划之前，也先于 mock 和真实副作用。按注册顺序执行，后一个控制看到前一个的有效参数；deny 阻止该工具，结果为零 attempts，不 mock、不计工具执行费、不进入工具重试，不停止整个 Agent。allow 仍受平台权限和人工审批约束。

权限、审批卡、序列化准备状态、资源 lane、真实执行及后置事件应使用同一份有效参数。工具内部重试复用准备结果。审批恢复从 originalArgs 重新检查；有效参数改变则旧批准失效。取消中止等待，晚到 allow 不能启动工具。旧审批恢复和现代 continuation 都保留 Hook 配置。

additionalContext 随工具记录持久化，转义后投影到后续模型输入中的普通 tool result，按工具行、原生 toolCall 和 hook 去重；恢复保留先前片段，同一 hook 返回更新指引时替换该片段。不改写存储的工具结果内容，不创建或改写 user/system 消息；被拒绝的调用也可保留上下文。该已提交契约仍待集成产品验证。

## 事件

| 事件                      | 含义                                           |
| ------------------------- | ---------------------------------------------- |
| beforeToolCall            | 工具准备，唯一 HTTP 控制点                     |
| afterToolCall             | 最终参数及结构化结果，包括 blocked             |
| onToolCallError           | 真实工具异常，不包括 Hook deny                 |
| beforeHumanIntervention   | 审批前的原生工具 ID 与有效参数                 |
| afterHumanIntervention    | 批准 / 拒绝动作、原因及受影响工具 ID           |
| onStopByHumanIntervention | 人工停止运行的原因及工具关联                   |
| beforeStep                | 步骤开始前                                     |
| afterStep                 | 步骤内容、结果及使用统计                       |
| onComplete                | 终止原因、最终回复、附件和统计，不包括异步停驻 |
| onError                   | 原业务异常及运行关联                           |
| beforeCompact             | 压缩前消息 /token 数                           |
| afterCompact              | 压缩消息组 ID、前后数量、摘要                  |
| onCompactError            | 压缩真实错误及 token 信息                      |
| beforeCallAgent           | 父运行准备创建 / 启动子 Agent                  |
| afterCallAgent            | 子运行创建 / 启动返回，**不是子运行完成**      |
| onCallAgentError          | 子运行创建 / 启动失败或抛异常                  |

除配置了控制模式的 `beforeToolCall` 外，其余均仅通知。共享群的子运行可没有独立 `threadId`。子完成由其自身 `onComplete` 表达，父 hooks 不自动继承给子 operation。

压缩通知会等待投递，慢接收端会增加延迟；通知失败不能回滚压缩或改变压缩重试。既有 `fallback:'none'` critical 回调保留关键失败传播，但不得递归修改业务终态或新增重复结束通知。错误后 state reload 失败只允许回退到本次执行已加载的状态，保留原错误。

## 覆盖限制

覆盖服务端 Runtime 管理的工具，包括其客户端 / 设备转发路径；不覆盖独立客户端 Runtime 或异构 Agent 内部工具。不提供全局强制治理、自动子继承、输出改写、outbox 或 exactly-once。发布前须对协调给出的最终集成版本及真实 local/queue/device/Web 结果逐项核实。
