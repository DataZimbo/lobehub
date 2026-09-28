# 开源 Office 引擎与 AI 办公开源方案调研报告

> **任务**：T-566 调研开源 office 引擎与 AI 办公开源方案（Goal「AI Office 能力：市场全景调研、可行性分析与架构路线图」开源层调研线）
> **日期**：2026-09-29
> **分支**：`research/ai-office-agent`，本文件位于 `docs/research/`
> **调研方法**：GitHub REST API（star/fork/版本/license 字段）、仓库 LICENSE 文件原文、官方文档与 Release Notes，全部数据于 2026-09-29 采集并随文标注来源。本机对 github.com 网页直连不稳定，git 协议不可达，故以 GitHub API 与 raw 文件通道核实为准。
> **性质**：纯调研报告，不含任何产品实现代码。

---

## 0. 摘要（TL;DR）

本次调研覆盖两条线共 **20 个开源对象**：

- **线 A · 开源文档引擎/编辑器内核（14 个）**：OnlyOffice DocumentServer、Collabora Online、Univer、Luckysheet、Handsontable（表格/套件 5）、Tiptap、Plate、Slate（富文本框架 3）、PptxGenJS、docx、exceljs、SheetJS（生成库 4）、reveal.js、impress.js（演示框架 2）。
- **线 B · AI 办公开源项目（6 个）**：genspark-ai/genoffice、tabtin-ai/TabTin、presenton、banana-slides、PPTist、PPTAgent。

核心结论（详细论证见正文）：

1. **LobeHub 的 Office 能力应分四层选型，没有单一项目能全覆盖**：生成层（PptxGenJS/docx/exceljs，全 MIT，可直接 npm 引入）、表格编辑层（Univer，Apache-2.0，可 npm 嵌入）、富文本层（继续基于现有 Lexical/`@lobehub/editor` 演进，吸收 Tiptap/genoffice 的 AI 编辑协议思想，不迁移）、完整套件层（OnlyOffice/Collabora，仅作云端可选自部署服务，iframe 接入，代码级引入被 License 与架构双重否决）。
2. **License 红线总体畅通但有三处必须立规**：Handsontable 为自定义非商业许可（SaaS 直接冲突，排除）；TabTin/PPTist/banana-slides 为 AGPL-3.0（网络服务传染，仅可作独立自部署参考，不可嵌入云服务）；OnlyOffice 为 AGPL-3.0（独立服务 + iframe 用法安全，严禁代码并入主仓库）。Univer、genoffice、presenton、PPTAgent、Collabora（MPL-2.0）、Tiptap/Plate/Slate 及全部生成库均为 Apache-2.0/MIT/MPL-2.0，与 LobeHub 的 LobeHub Community License（基于 Apache-2.0）+ 云服务模式完全兼容。
3. **genoffice 是本轮调研中架构价值最高的对象**：其「block 锚定 OOXML + 仅重写脏块 + 字节保留回写」的 docx 编辑方案与 `docs read --range` / `docs apply --ops` 的 agent 编辑协议，与 LobeHub 现有 `packages/editor-runtime` 的 LiteXML 节点编辑协议高度同构，是 LobeHub 文档工具接口设计的直接范本；其依赖组合（Tiptap + Univer + Konva + Rust sidecar）验证了低成本拼装全格式 Office 的可行路线。
4. **AI 生成 PPT 的最快落地路径是自部署 presenton（Apache-2.0，带 MCP server）或 PPTAgent（MIT，带反思式生成-评审闭环）作为 agent 后端 worker**；但需注意全行业的共同短板：除 genoffice 外，AI PPT 项目的「PPTX 可编辑导出」均为图像/近似方案，可编辑性与视觉保真不可兼得。
5. **不建议引入**：Luckysheet（2025-10 已归档 EOL）、impress.js（2022 年起停摆）、Slate（无电池框架，等同自建）、Handsontable（License 冲突）。Handsontable 的 docs MCP server / Agent Skills 做法可作为 LobeHub 工具文档面向 agent 暴露的工程参考。

---

## 1. 背景与调研范围

### 1.1 调研背景

Goal「AI Office 能力」要求在不做产品实现的前提下，完成市场全景调研、可行性分析与架构路线图设计。本任务（T-566）负责其中**开源层**：系统调研开源 office 引擎/编辑器内核与 AI 办公开源项目，评估其对 LobeHub 的可复用价值（能否引入、引入代价、License 兼容性），为后续可行性分析（选型建议、成本/风险评估）与架构路线图提供输入。

### 1.2 LobeHub 现有实现基线（复用性分析的起点）

调研结论均对照以下现状得出（代码取自本仓库 `feat/goal-result-delivery` 工作区，2026-09-29）：

| 现状资产 | 说明 |
|---|---|
| `@lobehub/editor` v4.27.3 | 基于 Meta **Lexical** 的自研富文本编辑器（DOM/contentEditable），依赖含 `@lexical/table`、`@lexical/yjs`、`yjs`、remark Markdown 管线、shiki、mermaid、katex；已具备**协同底座（yjs）与表格节点**能力 |
| LiteXML 编辑协议 | `@lobehub/editor/litexml-commands` 暴露 `LITEXML_APPLY/INSERT/MODIFY/REMOVE` 命令：以带稳定 `id` 属性的 XML 片段表示文档节点，支持块级锚定编辑 |
| `packages/editor-runtime` | 浏览器端 `EditorRuntime`（`editTitle`/`initPage`/`modifyNodes`/`replaceText` 四个变更 API）+ 纯函数编辑计划器 `liteXMLEditPlan`（操作排序、id 依赖、列表触碰检测）；其注释明确同一套计划器亦供**服务端 headless agent-document editor** 使用（`@lexical/headless`） |
| `packages/builtin-tool-agent-documents` | agent 文档 builtin tool：`createDocument`/`readDocument`（XML 格式带稳定节点 id，长文档分页窗口返回）/节点级更新/`listDocuments`，scope 支持 `agent`/`currentTopic` |
| 文档/文件 UI | `src/features` 下 `EditorCanvas`、`EditorModal`、`PageEditor`、`DocumentModal`、`AgentDocumentsExplorer`、`FileViewer`（目前主要支持 PDF 预览，其余格式落 `NotSupport` 兜底） |
| 许可证 | **LobeHub Community License**：基于 Apache-2.0，附加条款允许不修改原样的商业使用、衍生作品需向 LobeHub 申请商业授权；贡献代码可用于商业版（含云端）。依赖侧因此偏好 Apache-2.0/MIT 等宽松许可 |

关键观察：LobeHub 已经拥有「富文本编辑器 + 块锚定编辑协议 + headless 服务端编辑 + agent 工具」的完整骨架，当前缺口在 **Office 文件格式（docx/xlsx/pptx）的原生读写与渲染**——这正是本次调研对象的主要价值区间。

### 1.3 调研问题

对每个对象回答四个问题：**文档模型是什么？如何渲染？协同能力如何？License 与商用限制是什么？** 并最终回答：**LobeHub 能否引入、引入代价多大、License 是否兼容？**

---

## 2. 线 A：开源文档引擎 / 编辑器内核

### 2.1 套件级引擎

#### 2.1.1 OnlyOffice DocumentServer

- **仓库**：<https://github.com/ONLYOFFICE/DocumentServer>（star 6,953，2026-09-29 GitHub API）
- **版本/维护**：v9.4.0（2026-05-19），活跃；Ascensio System 商业主导，社区版/企业版/开发者版三轨
- **文档模型**：以 **OOXML 为原生格式**（区别于 LibreOffice 系的 ODF 原生），内部自研内存对象模型；服务端 FileConverter 负责 ODF/RTF/PDF/EPUB 等格式转换进出 OOXML；协同过程在服务端做操作合并与 changes 传输
- **渲染方式**：**纯客户端 Canvas 自绘**（sdkjs 将文字/表格/演示/PDF 全部绘制于 HTML5 Canvas），服务端只做鉴权、协同调度与格式转换，服务端资源消耗低于 Collabora
- **协同能力**：开箱即用实时协同（WebSocket，快速/严格两种合并模式）、评论、批注修订、版本历史、内置聊天；JWT 鉴权。v9.4 将 DocService 等合并为单进程，并移除社区版 20 连接数上限与品牌限制条款
- **License**：社区版 **AGPL-3.0**（[LICENSE](https://github.com/ONLYOFFICE/DocumentServer)），企业版/开发者版专有商业许可（白标、集群、Automation API 仅商业版）
- **AI 结合**：官方 AI 插件体系成熟（ChatGPT/Claude/DeepSeek/本地模型）、宏（JS 自动化）、服务端 Document Builder 无头生成；无原生 Agent/MCP 协议
- **对 LobeHub 价值**：唯一合理形态是**自部署服务 + iframe 嵌入**（DocumentServer 地址 + document key + JWT）；**代码级引入被 AGPL-3.0 否决**。独立服务通过网络调用不触发 copyleft，主流实践（Nextcloud/Moodle/Seafile 等 40+ 连接器）均如此。代价：安装包 700MB–1GB，独立容器常驻；对 LobeHub Cloud 是合理可选增值模块，OSS 自托管可作 docker-compose 可选 profile。需跟踪其与 Nextcloud/IONOS 之间的 AGPL 合规争议动态（品牌与重打包问题）

#### 2.1.2 Collabora Online

- **仓库**：<https://github.com/CollaboraOnline/online>（star 3,362）；主开发在 Gerrit，GitHub 为镜像 + issue 追踪（[CollaboraOnline/online.mirror](https://github.com/CollaboraOnline/online.mirror)）
- **版本/维护**：CODE 26.04.4.2（2026-09-24），25.04 LTS 并行维护；Collabora 公司主导，Nextcloud 深度参与
- **文档模型**：基于 **LibreOffice 内核**的文档模型，ODF 原生、OOXML 经导入/导出过滤器（26.04 持续投入 DOCX 布局对齐）；通过 **WOPI 协议**与宿主系统交换文件，天然适配已有文件存储
- **渲染方式**：**服务端渲染 + 位图瓦片传输**：每个文档一个 LibreOffice Kit 进程（jail 沙箱），渲染为瓦片经 WebSocket 推给浏览器 Canvas 拼图；26.04 提供实验性矢量渲染路径。代价是每文档一进程，内存占用显著高于 OnlyOffice
- **协同能力**：开箱即用多人实时协同（单文档进程内合并）、批注、追踪修改、跟随用户；版本历史由 WOPI 宿主实现；chroot/Landlock 沙箱、文档分级标签等安全面丰富
- **License**：**MPL-2.0**（文件级弱 Copyleft，[COPYING](https://raw.githubusercontent.com/CollaboraOnline/online.mirror/master/COPYING)）——仅修改受保护文件本身才需公开该文件源码，网络调用不传染，对 SaaS 友好。CODE 版要求保留品牌（去品牌需商业版）
- **AI 结合**：26.04 内置 **AI Assistant**：Impress AI 辅助生成演示文稿（大纲→slide 命令→演讲者备注）、Writer Markdown 互操作、服务端 `/co/collab` 端点
- **对 LobeHub 价值**：与 OnlyOffice 同为「自部署 + iframe/WOPI」候选，二选一即可覆盖完整 Office 套件。差异：Collabora 格式面更广、服务端渲染跨端一致但资源更重、MPL-2.0 法律风险更低；OnlyOffice OOXML 保真与客户端性能更好。**许可证允许独立服务用法，严禁代码并入**

### 2.2 电子表格引擎

#### 2.2.1 Univer ★（本轮重点）

- **仓库**：<https://github.com/dream-num/univer>（star 21,185，2026-09-29）；TypeScript monorepo
- **版本/维护**：v1.0.2（2026-09-24），近半年迭代极快；定位已更新为「**The Office Harness for AI Agents**」——表格/文档/幻灯片/多维表格/Board/PDF 统一 runtime
- **文档模型**：**自研统一文档模型**（非 OOXML 映射）：Unit（Workbook/Document/Slide）为顶层，命令-变更（Command/Mutation）驱动，快照为 JSON；浏览器与 Node.js 同构，**可在服务端 headless 运行**；xlsx/docx 导入导出属商业层 **Univer Pro**
- **渲染方式**：**Canvas 自绘**（自研 engine-render），独立公式引擎 engine-formula；视图层基于 React 18（**支持 React 19**，与 LobeHub 技术栈直接适配），另有 Vue/WC 适配器
- **协同能力**：OSS 版提供协同架构底座（命令/变更可序列化、权限模型）；**实时协同、编辑历史、协同服务端属 Univer Pro**（Open Core 双轨）
- **License**：核心 **Apache-2.0**（[LICENSE](https://github.com/dream-num/univer/blob/master/LICENSE)），对 SaaS/闭源分发完全无限制；Pro 层单独商业授权
- **AI 结合**：**五者中最强 AI 原生设计**：Headless 模式（Node ≥18.17）服务端无头读写/计算工作簿；统一 Facade API（FUniver/FWorkbook/FRange）适合封装为 LLM 结构化工具；官方 `dream-num/univer-mcp` MCP server 与 univer-mcp-start-kit；AI SDK 与 Worktree 工作流（Agent 隔离草稿→人审→合并）；已有 DeepSeek Harness、OpenClaw 等 Agent 宿主集成先例
- **对 LobeHub 价值**：**唯一适合直接 npm 依赖（`@univerjs/*` / presets）进仓库的方案**——Apache-2.0、TypeScript、React 19、Electron 兼容（Desktop 可用）；headless runtime 与 `packages/editor-runtime` 及 builtin-tool 体系契合度最高。代价：需按 preset 自行组装 UI 外壳；xlsx 导入导出与协同在 Pro 层，需按「采购 Pro」或「自建格式适配层」两条路做 PoC。与现有 Lexical 编辑器**互补而非替代**：Lexical 管聊天/富文本，Univer 补表格（genoffice 的 Sheets 已验证此路线）

#### 2.2.2 Luckysheet

- **仓库**：<https://github.com/dream-num/Luckysheet>（star 16,643）；**2025-10-30 被归档（EOL）**，官方推荐迁移 Univer（[issue #1454](https://github.com/dream-num/Luckysheet/issues/1454)）
- **版本/维护**：npm 最后版本 2.1.13（2021-01）；无安全修复
- **文档模型**：自研 JSON 配置模型（`options.celldata[]`），与 Excel 无原生映射，依赖 Luckyexcel（同样已归档）做 xlsx 转换
- **渲染/协同**：Canvas 自绘 + DOM 覆盖交互；协同仅有社区 demo 级后端
- **License**：**MIT**，无商用限制
- **对 LobeHub 价值**：**不建议任何形态引入**（归档 EOL）。仅剩架构参考意义：理解 Univer 数据模型演进渊源，做 Luckysheet 存量数据迁移时对照

#### 2.2.3 Handsontable

- **仓库**：<https://github.com/handsontable/handsontable>（star 22,053）；v18.1.1（2026-09-15），商业公司全职维护
- **文档模型**：本质是 **Data Grid 而非 Office 文档引擎**：数组/对象数组 + columns 配置，无自有文件格式；400+ 公式依赖独立引擎 **HyperFormula（GPL-3.0-only）**；官方自述「a data grid, not a spreadsheet」
- **渲染**：DOM（HTML table）+ 虚拟滚动，非 Canvas；**无内置协同**
- **License**：**自定义双许可，且不是开源 License**——自 v7.0.0（2019-03）从 MIT 转为专有许可：非商业/评估免费（`licenseKey: 'non-commercial-and-evaluation'`），**任何商业用途必须付费**，且禁止用于开发竞争软件（[LICENSE.txt](https://raw.githubusercontent.com/handsontable/handsontable/develop/LICENSE.txt)）；配套 HyperFormula 为 GPL-3.0-only
- **AI 结合**：官方 Agent Skills（Claude Code/Codex 插件市场）、文档 MCP server（`docs-assistant.handsontable.com/mcp`）、llms.txt——「让 Agent 会用我的库」的工程样板
- **对 LobeHub 价值**：**License 与 LobeHub 商业云模式根本冲突（SaaS 必须采购），能力定位（数据录入网格）也不满足 Office 件诉求——能力 + License 双淘汰**。仅将其 docs MCP / Agent Skills 作为 LobeHub builtin-tool 文档接入的参考实现

### 2.3 富文本编辑器框架

> 背景：LobeHub 现行栈为 Lexical（`@lobehub/editor`）。本节评估的迁移/并存价值。

#### 2.3.1 Tiptap

- **仓库**：<https://github.com/ueberdosis/tiptap>（star 38,569）；v3.31.3（2026-09-04），非常活跃，近期修复多个安全补丁
- **文档模型**：基于 **ProseMirror** 的 schema 化 JSON 文档模型（node/mark 树）；一等公民格式 HTML，Markdown 经扩展双向转换；**不映射 OOXML**（docx 导入导出需自行开发或借第三方转换层）
- **渲染**：DOM + contentEditable，React/Vue 官方绑定，NodeView 支持任意 React 组件；`@tiptap/static-renderer` 支持 Node 侧无头渲染
- **协同**：官方基于 **Yjs（CRDT）** 的协同扩展；服务端可自托管 Hocuspocus（开源 WebSocket）或付费 Tiptap Cloud
- **License**：核心 **MIT**（v3 大部分原 Pro 扩展已并入开源包）；商业层为 Tiptap Cloud、@tiptap-pro 历史包与 **AI Toolkit 订阅**——注意 `@tiptap/ai-toolkit` npm 元数据标注 MIT 但官方文档要求「任何 Tiptap 订阅」才能使用，**标注与商业条款存在张力，商用前需书面确认**
- **AI 结合**：生态最强：`@tiptap/ai-toolkit` 提供 tiptapEdit/proofread 等 Agent 工具、文档流式编辑、Tiptap Shorthand 紧凑文档编码（宣称降 token 80%），兼容 Vercel AI SDK/LangChain/OpenAI/Anthropic SDK
- **对 LobeHub 价值**：直接引入会与 Lexical **双栈并存**（体积 + 心智成本双高），不建议。正确姿势是「**吸收不引进**」：AI Toolkit 的 Agent 工具接口与 Shorthand 紧凑编码可移植到 Lexical；若未来立项「多人实时协作文档」且 Lexical+yjs 被验证不满足要求，Tiptap 是最强候选（需先解决 AI Toolkit/Cloud 订阅边界）

#### 2.3.2 Plate

- **仓库**：<https://github.com/udecode/plate>（star 16,621）；v53.3.x（新命名线 `@platejs/core`），活跃
- **文档模型**：底层 **Slate JSON 树** + 各插件 value schema；无内建强校验 schema
- **渲染**：DOM + contentEditable（slate-react），React 专属；插件 UI 走 shadcn/ui 风格
- **协同**：官方 `yjs` 包（Yjs CRDT）与 `comment` 批注包
- **License**：根 **MIT**（含「各 package 单独 LICENSE 优先」条款；实测 npm 包均 MIT）；商业层为 PlateJS Pro 模板/咨询
- **AI 结合**：`@platejs/ai`（MIT）：Copilot 式 AI 菜单、流式生成、Vercel AI SDK 集成；其「选中改写/续写/快捷指令浮层」交互是业界参考实现
- **对 LobeHub 价值**：与 Tiptap 同类的「双栈」问题且生态更窄；核心价值是**参考**（AI 编辑交互、插件化 schema 设计）

#### 2.3.3 Slate

- **仓库**：<https://github.com/ianstormtaylor/slate>（star 31,754）；`slate-react@0.127.1`（2026-09-25）；官方自称 beta，单核驱动，被 Tiptap/Plate/Lexical 生态挤压
- **文档模型**：极简自研 JSON 树，**无内建 schema**，一切自定义
- **渲染**：DOM + contentEditable；**无内建协同**（社区 slate-yjs 需自行拼装）；无官方 AI 能力
- **License**：**MIT**
- **对 LobeHub 价值**：直接引入价值低（无电池框架 = 自建编辑器）；仅作架构参考（自定义命令 + normalization 思想与 Lexical 相近）

#### 2.3.4 附：Lexical（LobeHub 现行栈，对照项）

Meta 出品，MIT。LobeHub 已在 v4.27 深度落地（含 `@lexical/yjs` 协同底座、`@lexical/table`、`@lexical/headless` 服务端无头编辑）。**调研结论：延续 Lexical 主线、吸收其他框架的 AI 协议设计，是编辑层的最优路径**——迁移成本（@lobehub/editor 全部插件、LiteXML 协议、editor-runtime）远超收益。

### 2.4 Office 文件生成库（生成层）

#### 2.4.1 PptxGenJS

- **仓库**：<https://github.com/gitbrent/PptxGenJS>（star 6,203）；v4.0.1；TypeScript；维护放缓（最近 push 2025-11）但可用
- **文档模型**：无中间模型——**命令式 API**（`addSlide`/`addText`/`addTable`/`addChart`）直接拼装，内部生成 OOXML XML 片段经 JSZip 打包；支持 Slide Master 模板、`tableToSlides`（HTML table 一键转幻灯片）
- **渲染**：**不渲染**——纯生成库，输出 .pptx（Blob/base64/Node stream/Buffer），浏览器与 Node 同构（Serverless/Edge 可用）
- **协同**：无（文件级产物）
- **License**：**MIT**，无商业版
- **AI 结合**：README 明示「所有主流 LLM 都学习过本库」——LLM 代码生成/工具调用生成 PPTX 的事实标准
- **对 LobeHub 价值**：**高，推荐引入**：作为 Agent 服务端工具生成 PPTX artifact，零原生依赖、同构、MIT；引入代价极小（单包数百 KB）

#### 2.4.2 docx（dolanmiu/docx）

- **仓库**：<https://github.com/dolanmiu/docx>（star 5,918）；**v9.8.1**（2026-09-29）；**活跃**
- **文档模型**：**声明式对象树**（`Document/Paragraph/Run/Table/TextBreak...`），API 刻意向 OOXML 语义靠拢（「OOXML 的 JS 投影」），输出 .docx（zip）；v9 起支持 **patchDocument 修改既有 docx**（补齐「只能从零生成」短板）
- **渲染**：无渲染；Node 与浏览器同构（可进 Web Worker/Edge）
- **协同**：无
- **License**：**MIT**
- **AI 结合**：LLM 生成 docx 的主流库（对象树适合 LLM 逐节点输出）
- **对 LobeHub 价值**：**高，推荐引入**：与 PptxGenJS 组成文档 artifact 生成双子星；注意大文档生成是 CPU 同步操作，应放 worker/队列

#### 2.4.3 exceljs

- **仓库**：<https://github.com/exceljs/exceljs>（star 15,485）；4.4.0（2024-02）；**实质停摆**（最后 push 2025-01，open issues 809）；社区活跃分叉 `@protobi/exceljs`（4.5.x，持续安全维护，新增 PivotTable）
- **文档模型**：结构化 workbook/worksheet/row/cell 模型，**支持全套样式**、公式、数据校验、图表（有限）、图片、流式读写——比 SheetJS 社区版多样式能力
- **渲染**：无渲染；有浏览器 bundle
- **协同**：无
- **License**：**MIT**（含 `@protobi` 分叉）
- **AI 结合**：社区常见「LLM 生成带样式 Excel 报表」工具链选择
- **对 LobeHub 价值**：**中高**：生成「带格式 Excel artifact」的 MIT 内首选；代价是依赖链较老（archiver 历史 CVE）——建议锁定版本或评估 `@protobi/exceljs` 分叉，并在 package.json 记录选型理由供安全审计

#### 2.4.4 SheetJS

- **仓库**：<https://github.com/SheetJS/sheetjs>（star 36,346；GitHub 为镜像，新家 git.sheetjs.com）；npm `xlsx@0.18.5` **2022 年起弃更 npm**，0.19.x/0.20.x 仅在自有 CDN 分发（[issue #2822](https://github.com/SheetJS/sheetjs/issues/2822)）
- **文档模型**：自研 workbook 对象模型，与 OOXML（.xlsx/.xls/.xlsb/.ods/.csv）双向转换，**解析能力业界最强**（含上古 BIFF）；社区版**无样式/图片写入**（样式/图片/PivotTable 属 Pro 商业版）
- **渲染**：无渲染
- **License**：**Apache-2.0**，附「未明示权利保留」声明；商业版 SheetJS Pro
- **供应链风险（比 License 更重要）**：npm 0.18.5 存在 CVE-2023-30533（原型污染）、CVE-2024-22363（ReDoS），修复仅在 CDN 0.19.3+，npm 无升级路径
- **对 LobeHub 价值**：**中**：适合「用户上传 xlsx → 解析为 JSON 喂 Agent/展示」。引入方式建议**按官方推荐从 cdn.sheetjs.com vendor 固定新版本**而非依赖 npm 0.18.5；若只做生成不做解析，用 exceljs 替代

### 2.5 演示文稿渲染框架

#### 2.5.1 reveal.js

- **仓库**：<https://github.com/hakimel/reveal.js>（star 72,353，本轮最高）；**6.0.2**（2026-09-10），维护 15 年持续活跃
- **文档模型**：无独立文档模型——HTML `<section>` 即幻灯片（嵌套垂直页、fragments、speaker notes），配置走 JSON，Markdown 插件可直接吃 Markdown
- **渲染**：**DOM + CSS3 transform/transition** 浏览器播放；PDF 导出靠浏览器打印样式；multiplex 插件仅演讲级多屏同步
- **协同**：无编辑协同
- **License**：**MIT**；注意区分作者的商用托管产品 slides.com（独立 SaaS）
- **AI 结合**：无官方 AI；「LLM 生成 Markdown/HTML → reveal.js 播放」是社区主流玩法
- **对 LobeHub 价值**：**高**：npm 依赖直接嵌入 React，作为 AI 生成幻灯片的**预览/播放层**（配合 Markdown 插件可让 LLM 直出 Markdown 幻灯片），与 PptxGenJS（导出 .pptx）互补形成「生成→预览→导出」闭环

#### 2.5.2 impress.js

- **仓库**：<https://github.com/impress/impress.js>（star 38,172，star 与活跃度严重倒挂）；v2.0.0（2022-07-22），此后基本停摆
- **文档模型**：无模型——HTML `<div class="step">` + `data-x/y/z/rotate/scale` 数据属性描述 3D 画布坐标
- **渲染**：DOM + CSS3 3D transforms（Prezi 式缩放平移，非传统翻页）
- **协同**：无；无官方 AI
- **License**：**MIT**
- **对 LobeHub 价值**：**低，不建议引入**：预 ES6 代码风格、插件生态凋敝、编辑/导出能力为零；Prezi 式 3D 受众窄，reveal.js 6 的 zoom 能力可覆盖大部分场景

### 2.6 线 A 横向对比表（数据截至 2026-09-29）

| 项目 | 定位 | 最新版本 | Star | 文档模型 | 渲染 | 协同 | License | SaaS 兼容 | 引入形态 |
|---|---|---|---|---|---|---|---|---|---|
| OnlyOffice | 套件（OOXML 原生） | v9.4.0 (2026-05) | 6,953 | OOXML + 自研内存模型 | 客户端 Canvas | 内置（WebSocket） | **AGPL-3.0**/商业 | ✅（独立服务用法） | 自部署 Docker + iframe |
| Collabora Online | 套件（LibreOffice） | CODE 26.04.4.2 | 3,362 | LibreOffice 模型（ODF 原生） | 服务端瓦片 | 内置（WOPI） | **MPL-2.0** | ✅（弱 Copyleft） | 自部署 Docker + iframe |
| **Univer** | 表格/文档/Slides SDK | v1.0.2 (2026-09-24) | 21,185 | 自研统一模型（JSON 快照/命令） | Canvas | Pro 层 | **Apache-2.0**/Pro | ✅✅ 最友好 | **npm SDK 直接嵌入** |
| Luckysheet | 表格（EOL） | 2.1.13 (2021) | 16,643 | 自研 JSON 配置 | Canvas+DOM | demo 级 | MIT | ✅ | 不引入 |
| Handsontable | Data Grid | 18.1.1 | 22,053 | 数据网格（非文档） | DOM | 无 | **自定义非商业** | ❌ 须付费 | 排除 |
| Tiptap | 无头富文本框架 | v3.31.3 | 38,569 | ProseMirror JSON | DOM(+SSR) | Yjs CRDT | MIT（AI Toolkit 订阅） | ✅ | 参考/未来协同候选 |
| Plate | React 富文本框架 | v53.3.x | 16,621 | Slate JSON | DOM | Yjs + 批注 | MIT | ✅ | 参考 |
| Slate | 编辑器底座 | 0.127.1 | 31,754 | 自定义 JSON | DOM | 无（社区） | MIT | ✅ | 仅架构参考 |
| PptxGenJS | PPTX 生成 | 4.0.1 | 6,203 | 命令式 API→OOXML | 不渲染 | 无 | MIT | ✅ | **npm 直接引入** |
| docx | DOCX 生成 | 9.8.1 | 5,918 | 声明式 OOXML 投影（支持 patch） | 不渲染 | 无 | MIT | ✅ | **npm 直接引入** |
| exceljs | XLSX 读写 | 4.4.0（停摆） | 15,485 | workbook 对象（全样式） | 不渲染 | 无 | MIT | ✅ | npm 引入（锁版/分叉） |
| SheetJS | 表格解析/生成 | npm 0.18.5 / CDN 0.20.x | 36,346 | workbook 对象（社区版无样式） | 不渲染 | 无 | Apache-2.0（npm 版带 CVE） | ✅ | vendor CDN 版 |
| reveal.js | HTML 演示框架 | 6.0.2 | 72,353 | HTML section / Markdown | DOM+CSS3 | 无 | MIT | ✅ | **npm 直接引入（播放器）** |
| impress.js | 3D 演示框架 | 2.0.0（2022） | 38,172 | data 属性定位 | DOM+CSS3 3D | 无 | MIT | ✅ | 不建议引入 |

---

## 3. 线 B：AI 办公开源项目

### 3.1 genspark-ai/genoffice ★（本轮重点）

- **仓库**：<https://github.com/genspark-ai/genoffice>（star 8,067 / fork 1,051，2026-09-29）；2026-07-31 创建，约两个月 star 破 8k；Genspark（Mainfunc Inc.）官方维护，基本每日提交；v0.11.0（2026-09-28）
- **形态**：TypeScript 引擎层（纯 TS npm workspace）+ Rust xlsx sidecar + Electron 桌面壳；背景：创始人景鲲称一名工程师用约 1 万美元 LLM token、7 天构建出 Alpha
- **文档模型（核心创新）**：**以原始 OOXML 文件为唯一 source of truth 的「块锚定 + 脏区重写」架构**（README「How it works」）：
  - `.docx`：打开时将 `word/document.xml` 解析为 block tree，**每个 block 锚定到其原始 XML**；保存时仅把 dirty blocks 重新生成为 OOXML fragment（仅引用已有 style）splice 回原 document.xml，zip 内其余 entry **字节级原样拷贝**
  - `.xlsx`：自研 Rust sidecar（读层 calamine、计算层 IronCalc），支持 pivot table、slicer、条件格式、公式追踪
  - `.pptx`：自研 TS 引擎，含 MicroType Express 嵌入式字体解码（libeot 移植，MPL-2.0）+ opentype.js 字体度量
  - PDF：PDFium 重写 content stream（真改文字）；pdf2docx/html2docx 为自研几何布局分析转换器
  - Markdown：Tiptap block editor ↔ 纯 .md；HTML：单文件 .html + design brief token 体系
- **渲染**：分应用混合渲染——Docs/Markdown = **Tiptap/ProseMirror（DOM）**；Sheets = **Univer（Canvas）**；Slides = **Konva（Canvas）**（母版/版式/smart guides/非破坏性裁剪）；PDF = pdf.js 渲染 + PDFium 编辑
- **协同**：**无多人实时协同**（本地单用户桌面应用）；AI 每次编辑生成 snapshot 可一键回滚；Word 风格 tracked changes
- **License**：主体 **Apache-2.0**；`ee/` 目录为未来企业模块预留（自定义 GenOffice Enterprise License）；商标归 Mainfunc，fork 需换品牌。Apache-2.0 无 copyleft，SaaS/闭源分发均不受限
- **AI 结合（最强项）**：内置 AI panel（Genspark 账号免 key 或 BYOK）；**`genoffice` CLI（headless，与 GUI 同引擎）**：`docs read/apply --ops edits.json`（ops 化编辑协议）、`convert`（md/html/docx/xlsx/pptx ↔ pdf 全互转）、`slides check/audit/render`（溢出/重叠检查 + 每页 PNG 渲染供 agent 视觉自检）、`create --type pptx`、分阶段 deck 流程（`deck_start → deck_page → deck_build → deck_replace`）；**Agent skill**（Claude Code/Codex/Cursor/Gemini CLI/Copilot 等一键安装）；**MCP server**：每个 CLI 命令即一个 MCP tool（共 29 个），支持 stdio、应用内 HTTP（可驱动可见 Word 编辑器 tab）、远程 HTTP。设计哲学：**CLI 内不做模型调用，agent 负责思考、CLI 负责执行与校验**
- **对 LobeHub 价值**：
  - 直接 npm 依赖：**暂不可行**——引擎层未作为独立 npm 包发布，`render`/`convert` 依赖隐藏 Electron 进程（headless 主机需 xvfb）
  - 自部署服务：**可行**——以 CLI/MCP 作为文档 worker 服务供 LobeHub agent 调用；代价是每 worker 需 Electron 运行时（安装包约 150–190MB）
  - **架构参考（当前最大价值）**：①「block 锚定 OOXML + 脏区重写 + 字节保留」是 docx 编辑保真的标杆方案，可直接指导 `@lobehub/editor` 设计 OOXML 序列化/回写层（与 LiteXML 块协议天然同构）；② `docs read --range` + `docs apply --ops` 与 slides check/render 自检闭环是 LobeHub agent 工具接口的直接范本；③ 依赖组合（Tiptap + Univer + Konva + PDFium + Rust sidecar）验证了低成本拼装全格式 Office 的可行路线

### 3.2 tabtin-ai/TabTin

- **仓库**：<https://github.com/tabtin-ai/TabTin>（star 425 / fork 102）；2026-08-19 创建，Public Preview 阶段，无正式 release；上海墨凡科技；TS monorepo + Python/Django + Go + Electron + iOS/Android 壳
- **定位**：「人与多个 AI Agent 协作的 workspace」——消息/文档/多维表格/演示文稿/浏览器/终端一体，Agent 可直接创建/编辑这些应用
- **文档模型**：自研 **TabDoc**（`tabdoc-ui`/`tabdoc-host-runtime`/`doc-renderer`/`doc-editor` 分层 packages），doc-editor package.json 显示基于 **Tiptap 2/ProseMirror**（`@tiptap/core ^2.26`、`@tiptap/pm`）+ tiptap-markdown；**多维表格完全自研**（`table-engine`/`table-engine-canvas`/`table-kernel`——内核用 **PGlite 嵌入式 Postgres**）；另有 tabslide、office-preview-runtime、local-docparse、crawlspace-core（浏览器采集）
- **渲染**：Web/Electron 内 DOM（Tiptap 文档）；表格 Canvas 自绘；**React 19 + zustand——与 LobeHub 技术栈高度重合**
- **协同（本项目强项）**：**Yjs + y-prosemirror + @tiptap/extension-collaboration + Hocuspocus + 独立 collab-live 服务 + Centrifugo**（WebSocket broker）；五元权限模型（Org/Workspace/Agent/App/Device）；Workspace Checkpoint；任务交接带权限冻结与审计
- **License**：根 **AGPL-3.0-only**（可购买商业授权，README 注明）；⚠️ 部分 packages 的 package.json 标注 MIT 与根 LICENSE 冲突，应以根 LICENSE 为准，商用前需官方澄清。**AGPL 对 SaaS 有网络传染性——将 TabTin 代码嵌入 LobeHub 云服务即触发开源义务**
- **AI 结合**：AI 是核心定位：`agent-runtime`/`agent-host`/`action-tools`（agent 工具接口协议）/`skills` 等 packages；Agent 与人操作同一份文档/表格/slide 结果；浏览器采集、Python 执行、PTY 终端、LSP
- **对 LobeHub 价值**：直接引入**不可行**（AGPL + 组件未发布 npm + 整体平台耦合）；自部署仅限内部工具场景。**架构参考价值很高且技术栈最贴近**：① 文档协同栈选型（Tiptap + Yjs + Hocuspocus + Centrifugo）可直接对照 `@lobehub/editor` 的协同设计（现有 `@lexical/yjs` 底座之外的服务端选型参考）；② TabDoc 的 host-agnostic 分层（editor core / host runtime / UI 三层）与 `packages/editor-runtime` 的分层思路一致，可参考其 ports/adapter 划分；③ action-tools 的 agent-工具协议与 Workspace 权限/Checkpoint 设计值得对照

### 3.3 presenton/presenton

- **仓库**：<https://github.com/presenton/presenton>（star 10,830 / fork 1,643）；electron-v0.9.11-beta（2026-09-21）；活跃；定位 Gamma/Canva/Beautiful AI 的开源自托管替代品；TS（Next.js 前端）+ Python（FastAPI 后端）+ Electron
- **文档模型**：**模板驱动的结构化生成模型**：prompt/文档/PPTX → LLM 生成 outline（JSON）→ 映射进内置模板（HTML + Tailwind CSS 的 template-v2 体系；支持用户上传 PPTX 反推模板）→ 服务端组装为 PPTX；提供 `slides_markdown` API（每页一段 Markdown，LLM 负责选版式映射）；文档解析用 LiteParse（OCR）。**非 OOXML 原生模型**，PPTX 是导出目标
- **渲染**：浏览器内 DOM 渲染（HTML/Tailwind slide，可拖拽编辑）；导出 PPTX（可编辑）/PDF
- **协同**：无实时协同编辑；多用户 workspace + 管理员面板 + 用户级 API key；Mem0 按 presentation 做记忆
- **License**：**Apache-2.0**；商业形态为 Presenton Cloud（托管）与 Enterprise（K8s/SSO/审计）；社区模板 gallery 可关
- **AI 结合**：AI 生成即核心：20+ LLM provider、web grounding、图片生成；**内置 MCP server**（Streamable HTTP `/mcp`，API key 认证）+ REST API
- **对 LobeHub 价值**：**自部署服务（AI PPT 最快落地路径）**：单容器 Docker 一体化部署，LobeHub agent 通过 MCP/REST 生成 PPTX；npm 嵌入不现实（全栈耦合）；iframe 过渡可用但账号体系割裂。代价：镜像约 800MB；生成质量依赖模板库，深度自定义版式需写 HTML/Tailwind 模板

### 3.4 Anionex/banana-slides（slides-ai 类代表）

- **仓库**：<https://github.com/Anionex/banana-slides>（star 15,667，该品类最高）；v0.9.0-rc.7（2026-09-05）；活跃（个人主导 + 赞助商）；TS 前端 + Python（FastAPI + LazyLLM）后端
- **文档模型**：**图像模型优先的自研页面模型**：文本 LLM 生成大纲 + 逐页描述（字段契约 v2 JSON），**nano banana pro 图像模型直接生成整页视觉**；导出「可编辑 PPTX」（Beta：生成图切分为可编辑元素，依赖百度智能云 OCR）+ PDF + 讲解视频。**非 OOXML 模型**
- **渲染**：整页生成图，前端 DOM 预览 + 框选区域编辑（overlay/replace）、智能擦除
- **协同**：无
- **License**：**AGPL-3.0**（README 明确「闭源商业用途需获取授权」，提供多租户商业版）。**AGPL 网络传染 → 与 LobeHub 闭源云模式不兼容**；另有图像模型生成成本高的问题
- **AI 结合**：完全 AI-native：「Vibe PPT」自然语言口头改稿（「把第三页改成案例分析」）、局部重绘、整页优化、素材解析（PDF/Docx/MD/Txt 自动提取）
- **对 LobeHub 价值**：直接复用价值低（AGPL + 图像模型成本 + 供应商锁定 + 可编辑导出未成熟）。参考：① 字段契约 v2 的「大纲/描述→页面」结构化生成协议；② 框选编辑/口头编辑的交互范式；③ 多供应商 LazyLLM 适配层设计

### 3.5 pipipi-pikachu/PPTist（Web PPT 编辑器代表）

- **仓库**：<https://github.com/pipipi-pikachu/PPTist>（star 9,357）；无 release 体系，持续发版（最近 push 2026-09-19）；个人维护，口碑好；**Vue 3 + TypeScript**
- **文档模型**：自研 JSON slide schema（页面/元素/主题分层，文本/图片/形状/线条/图表/表格/视频/音频/公式）；`.pptx` 导入保真约 80%（配套 [pptxtojson](https://github.com/pipipi-pikachu/pptxtojson)），导出保真 95%+
- **渲染**：**DOM + SVG**（网页级幻灯片编辑器）；**无协同**（明确不做）
- **License**：当前 **AGPL-3.0**；README「商业用途」节：禁止闭源商用，要么遵守 AGPL（含网络服务开源义务），要么付费买独立商业授权（¥2,999/年 或 ¥5,699 永久）；2022-05 之前的 Apache-2.0 历史版本已停维护
- **AI 结合**：模板式 AIPPT（非核心）；文本 AI 改写/扩写/缩写；社区大量 AI 接入实践
- **对 LobeHub 价值**：技术栈不兼容（Vue vs React）不能直接嵌。参考：① 元素 schema 与磁吸对齐/层级/组合等编辑器交互设计；② pptx 导入导出字段映射表；③ 证明 DOM+SVG 路线可达 95% 导出保真，是 LobeHub 自有 slide 编辑器的对标基准。若必须复用其编辑器，付费授权是可谈判路径

### 3.6 icip-cas/PPTAgent（学术派 Agent 生成代表）

- **仓库**：<https://github.com/icip-cas/PPTAgent>（star 5,070）；v1.1.38 lineage（DeepPresenter，ACL 2026 论文代码；PPTAgent 本体钉在 v0.2.0，EMNLP 2025）；2026-09 发布 Claude Code/Codex Skill 与 Atria Dawn Preview 模型；中科院计算所 + 上海 AI 实验室等
- **文档模型**：不以 OOXML 为编辑对象：**HTML 渲染的 slide 源文件 + 编辑动作（code actions）** → LibreOffice 转 PPTX；两阶段管线：分析参考 deck 提取结构/内容模式 → 草拟大纲 → 迭代生成编辑动作 + **视觉反思**（多模态模型评审渲染图）→ PPTEval 三维评估（Content/Design/Coherence）
- **渲染**：HTML/CSS slide → Playwright/Chromium 截图渲染 →（LibreOffice）转 PPTX
- **协同**：无
- **License**：当前主分支 **MIT**（2026-09-29 核实 [LICENSE](https://raw.githubusercontent.com/icip-cas/PPTAgent/main/LICENSE)）；⚠️ 早期版本（v0.2.x）许可证历史并非 MIT，复用时务必锁定所用 commit 核实
- **AI 结合**：本身就是 LLM agent 框架：MCP server、agent skill、20+ 工具沙箱、Deep Research 集成、文生图、环境接地反思
- **对 LobeHub 价值**：**自部署 Python worker 备选**：MIT + 输出原生可编辑 PPTX，可作 LobeHub agent 的 PPT 生成后端之一；代价是服务端依赖重（LibreOffice + Playwright + Python 3.12），生成是批处理模式非交互。**其「生成→渲染→视觉评审→修订」反思闭环可直接借鉴到 LobeHub 任意文档生成工具的自检设计**

### 3.7 线 B 横向对比表（数据截至 2026-09-29）

| 项目 | Star | 形态 | 文档模型 | License | SaaS 兼容 | AI/Agent 接口 | 对 LobeHub 复用方式 |
|---|---|---|---|---|---|---|---|
| **genoffice** | 8,067 | TS+Rust/Electron 桌面 | OOXML 锚定块树 + 字节保留回写 | **Apache-2.0**（ee/ 预留企业许可） | ✅ | AI panel + CLI + skill + **MCP（29 tools）** | 架构标杆；引擎未发 npm，走自部署 worker |
| **TabTin** | 425 | TS monorepo 全栈平台 | 自研 TabDoc（Tiptap JSON）+ 自研表格（PGlite） | **AGPL-3.0-only**（可买授权） | ❌ 网络传染 | 内置 agent runtime + action-tools | 仅架构参考（协同栈选型最贴近） |
| **presenton** | 10,830 | TS(Next.js)+Py(FastAPI) | 模板驱动 outline JSON → PPTX | **Apache-2.0** | ✅ | 生成即核心；**MCP server + REST** | **自部署 Docker 接入**（AI PPT 最快落地） |
| **banana-slides** | 15,667 | TS 前端 + Py 后端 | 图像模型整页生成 + 字段契约 v2 | **AGPL-3.0**（闭源商用需授权） | ❌ | 完全 AI-native，Vibe 口头编辑 | 参考价值低（协议/交互范式） |
| **PPTist** | 9,357 | Vue 3 Web 编辑器 | 自研 JSON slide schema | **AGPL-3.0**（付费 ¥2,999/年） | ❌（可买授权） | 模板式 AIPPT | 交互/schema 参考（技术栈不兼容） |
| **PPTAgent** | 5,070 | Python agent 框架 | HTML slide + 编辑动作 → PPTX | **MIT**（当前主分支） | ✅ | Agent 框架本体：skill + MCP + 沙箱 | **自部署 Python worker / 反思管线参考** |

---

## 4. License 兼容性专章

### 4.1 LobeHub 自身的许可约束

LobeHub 主仓库采用 **LobeHub Community License**（基于 Apache-2.0 + 附加条款：不修改原样的商业使用允许；衍生作品需向 LobeHub 申请商业授权；贡献代码可用于商业版/云端）。这意味着：

1. **依赖侧**：宽松许可（MIT/Apache-2.0/BSD/MPL）依赖可自由引入与分发；Copyleft（GPL/AGPL）依赖不能进行代码级链接/合并，只能以「独立程序 + 进程间交互」方式使用；**自定义非商业许可（Handsontable）与商业云模式直接冲突**。
2. **对外再分发**：引入 Apache-2.0/MIT 组件后，LobeHub 仍可整体以自有许可证分发（需保留各组件版权与许可声明）；引入 copyleft 组件做代码级合并则污染主仓库。
3. **云服务**：SaaS 场景下 AGPL 触发「网络提供即分发」义务，GPL-3.0（HyperFormula）同理——两者均不能以任何形式进入 LobeHub 服务端依赖图。

### 4.2 全部 20 个对象的许可矩阵

| License 类型 | 对象 | 与 LobeHub 的兼容性结论 |
|---|---|---|
| MIT | Luckysheet、Tiptap、Plate、Slate、PptxGenJS、docx、exceljs、reveal.js、impress.js、PPTAgent | ✅ 完全兼容，可 npm 引入、可修改、可再分发（保留声明即可） |
| Apache-2.0 | Univer（OSS 核心）、genoffice（主体）、presenton、SheetJS | ✅ 完全兼容（SheetJS 注意 npm 版 CVE 与「未明示权利保留」声明，建议法务备案） |
| MPL-2.0 | Collabora Online | ✅ 文件级弱 Copyleft：仅修改其受保护文件需公开该文件；网络调用与链接均不传染。独立服务用法安全 |
| AGPL-3.0 | OnlyOffice（社区版）、TabTin、PPTist、banana-slides | ⚠️ 代码级引入 = 主仓库/云服务被传染。**仅限「独立服务 + iframe/HTTP」用法**（OnlyOffice 可行；TabTin/banana-slides 因耦合度无此用法价值）；PPTist/banana-slides 有付费授权渠道可作谈判备选 |
| GPL-3.0（配套） | HyperFormula（Handsontable 公式引擎） | ❌ 不得进入 LobeHub 依赖图 |
| 自定义非商业 | Handsontable 本体 | ❌ 商业云模式必须采购，直接排除 |
| 双许可/商业层 | OnlyOffice 企业版、Univer Pro、Tiptap Cloud/AI Toolkit、SheetJS Pro、TabTin 商业授权、PPTist 付费授权、Presenton Enterprise | 🔶 开源层可用；增强能力（协同、导入导出、AI Toolkit 等）需采购或绕开。注意 Tiptap AI Toolkit 的 npm MIT 标注与订阅条款矛盾，商用前需书面确认 |

### 4.3 必须写入工程规范的 License 红线

1. **AGPL/GPL 组件只能以独立进程运行、经网络/iframe 交互**，禁止任何代码级 import/链接/静态打包；保留 LICENSE 与版权声明。
2. **若要魔改套件行为（白标/定制 UI），回到商业版采购或转向 Univer Pro**，不得通过修改 AGPL 代码实现。
3. 新增依赖过 CI 时自动校验许可证白名单（MIT/Apache-2.0/BSD/MPL-2.0），对 AGPL/GPL/自定义许可 fail-fast。
4. 对 SheetJS 采用 vendor 固定版本策略并记录 CVE 豁免理由；exceljs 锁定版本或采用 `@protobi/exceljs` 分叉。

---

## 5. 对 LobeHub 的可复用价值评估

### 5.1 能力分层映射

把「Office 能力」拆成四层后，每个对象的落位立刻清晰——这也是后续架构路线图（兄弟任务）建议的分层：

| 能力层 | 职责 | 候选对象 | 引入方式 | License |
|---|---|---|---|---|
| **生成层** | Agent 生成 docx/xlsx/pptx artifact | PptxGenJS、docx、exceljs（+SheetJS 解析） | npm 依赖，服务端工具直接调用 | MIT/Apache-2.0 ✅ |
| **富文本编辑层** | 聊天/文档/知识库的富文本编辑与 AI 块编辑 | 现行 `@lobehub/editor`（Lexical）+ LiteXML 协议；吸收 Tiptap AI Toolkit / genoffice ops 协议 | 自研演进，不引入新框架 | MIT（自身）✅ |
| **表格/Office 件编辑层** | xlsx 及未来文档件的界面内编辑预览 | **Univer**（npm SDK）；genoffice CLI（headless 服务） | npm 嵌入或自部署 worker | Apache-2.0 ✅ |
| **完整套件层** | 用户要求「真 Office」全功能（含复杂格式保真） | OnlyOffice / Collabora（二选一） | 自部署服务 + iframe，仅云端/自托管可选 | AGPL-3.0/MPL-2.0（独立服务用法）⚠️ |
| **AI 生成 PPT 服务层** | 模板化快速生成 PPT 的现成产品能力 | presenton（首选）/ PPTAgent（备选） | 自部署 worker，MCP/REST 接入 | Apache-2.0/MIT ✅ |
| **演示播放层** | slides 预览/播放 | reveal.js | npm 嵌入 React | MIT ✅ |
| **协同层**（未来） | 多人实时协同编辑 | 现行 `@lexical/yjs` 底座；参照 TabTin 的 Hocuspocus + Centrifugo 服务端选型 | 自研 + Yjs 生态 | MIT ✅ |

### 5.2 与 LobeHub 现有实现的结合点

1. **`packages/editor-runtime` × genoffice**：两者同为「块锚定 + 结构化编辑协议」。LiteXML 的 `id` 锚定节点与 genoffice 的 OOXML block 锚定同构；genoffice 的 `docs read --range`（窗口化读取）与 LobeHub `readDocument` 的分页窗口设计一致；其 `docs apply --ops` 的 ops JSON 协议（insert/modify/remove + 锚点 id）可直接对照 LiteXML 的 APPLY/INSERT/MODIFY/REMOVE 命令集做协议校验补强（如 slides check/render 式的**视觉自检闭环**）。
2. **headless 双端架构 × Univer**：editor-runtime 已在浏览器与 Node 服务端共享编辑计划器；Univer 的同构 headless 模式（Node 无头读写/计算工作簿）与之完全同构，且其 Facade API 适合封装为 LobeHub builtin-tool 的结构化工具（比照 `builtin-tool-agent-documents` 的 manifest/systemRole 体系）。
3. **生成层 × artifact 体系**：PptxGenJS/docx/exceljs 生成文件后可走 LobeHub 现有文件/artifact 上传与 FileViewer 预览链路（FileViewer 当前仅 PDF——新增 docx/xlsx/pptx 预览正是 Office 能力的自然延伸）。
4. **agent 工具接口 × 29-tool MCP 范本**：genoffice「CLI 内不做模型调用，agent 负责思考、CLI 负责执行与校验」的哲学与 LobeHub builtin-tool 设计一致；其工具粒度划分（read/apply/convert/check/render/create + 分阶段 deck 流程）是工具设计的直接范本。
5. **协同底座**：`@lexical/yjs` 已在依赖中；TabTin 验证了 Tiptap + Yjs + Hocuspocus + Centrifugo 的完整生产组合，为 LobeHub 未来协同的服务端选型（presence、消息广播、checkpoint）提供参照。

### 5.3 四种候选架构模式（供可行性分析展开）

| 模式 | 内容 | 代表对象 | 代价 | 风险 |
|---|---|---|---|---|
| A. 生成库直引 | 服务端引入生成三件套，agent 工具直接产出 Office 文件 | PptxGenJS/docx/exceljs | 极低（单包数百 KB，无原生依赖） | 生成质量依赖 prompt；无「所见即所得」精修 |
| B. SDK 深度嵌入 | npm 嵌入 Univer 获得表格/文档件编辑面 | Univer presets | 中（SDK 体积与概念负担、preset 自组装） | xlsx 高保真导入导出/协同在 Pro 层 → 采购或自建适配层 |
| C. 独立服务接入 | 自部署现成服务，经 iframe/MCP/REST 接入 | OnlyOffice/Collabora（编辑器）、presenton/PPTAgent（AI PPT）、genoffice CLI（文档处理 worker） | 中高（容器镜像、运维、Electron/Python 运行时） | 服务可用性、版本升级、AGPL 边界合规（仅 C 组编辑器） |
| D. 协议参考自研 | 不引入代码，只吸收架构与协议 | genoffice 块锚定/ops 协议、TabTin 协同栈、PPTAgent 反思闭环 | 高（自研周期） | 保真度需长期打磨 |

**结论倾向**：近期落地 = A（生成层立即引入）+ D（协议吸收进现有 Lexical 栈）；中期评估 = B（Univer PoC，同步启动 Pro 采购评估）；C 作为云端可选增值模块按需求开启（OnlyOffice/Collabora 二选一，presenton 作 AI PPT 快速通道）。

### 5.4 引入代价汇总与风险清单

- **包体积**：生成三件套合计 < 2MB（gzip 前）；Univer presets 较重（MB 级 + 按需 preset）；reveal.js 约 1MB。对桌面端（Electron）无感，Web 端需按 surface 代码分割。
- **运行时依赖**：模式 C 引入容器/运行时运维成本（OnlyOffice/Collabora GB 级镜像；genoffice 需 Electron+xvfb；PPTAgent 需 LibreOffice+Playwright+Python）。
- **供应链安全**：SheetJS npm 版永久 CVE；exceljs 停摆期依赖 CVE → 锁定版本/分叉并审计。
- **License 合规**：见第 4 章红线。
- **保真度风险**：除 genoffice 外，AI PPT 的「可编辑 PPTX 导出」全行业均为近似方案；Univer OSS 不读写 Office 文件。任何「AI 生成 + 人精修」闭环都需在 PoC 中实测保真度。
- **供应商锁定**：Univer Pro、Tiptap AI Toolkit 等商业层采购条款需在采购前确认 SaaS 转售权。

---

## 6. 结论与建议（可直接支撑可行性分析）

1. **License 层面**：20 个对象中 15 个与 LobeHub 模式完全兼容（MIT ×10、Apache-2.0 ×4、MPL-2.0 ×1）；4 个 AGPL 对象（OnlyOffice、TabTin、PPTist、banana-slides）仅限独立服务用法；Handsontable（自定义非商业许可）排除。选型不需要为许可证支付额外成本（除非选择 Univer Pro/Tiptap AI Toolkit 等商业增强层）。
2. **技术路线**：「Lexical 主线 + 生成库三件套 + Univer 表格底座 + 可选自部署服务」的组合覆盖了从 artifact 生成到界面内编辑的完整谱系，且每一层都有 License 合规的落地路径。
3. **genoffice 与 Univer 是本轮价值最高的两个对象**：前者给出「OOXML 块锚定编辑 + agent 工具协议」的标杆实现，后者是唯一可代码级引入的生产级 Office SDK。
4. **AI PPT 服务层**：presenton（Apache-2.0 + MCP）与 PPTAgent（MIT + 反思闭环）可在 1–2 周内以自部署 worker 形式为 LobeHub 提供 AI 生成 PPT 能力，作为自研 slide 编辑器成熟前的过渡。
5. **明确不做**：不迁移 Lexical → Tiptap/Plate/Slate；不引入 Luckysheet/impress.js；不将任何 AGPL 代码并入主仓库；Handsontable 仅留 docs MCP/Agent Skills 工程参考。

**建议下一步（供下游任务）**：
- 可行性分析任务可直接以第 5 章的四种架构模式 + 分层映射为骨架，展开成本/风险/成熟度评估；
- 架构路线图任务可基于「生成层→编辑层→协同层」的分阶段组合设计里程碑；
- PoC 优先级建议：① Univer preset 嵌入与 headless 工具封装；② docx 生成/patch 工具（docx 库）接入 agent；③ presenton 自部署与 MCP 联调；
- 采购评估并行启动：Univer Pro（xlsx 导入导出/协同）、Tiptap AI Toolkit（书面条款确认）。

---

## 7. 附录：调研方法与来源

- 数据采集日期：2026-09-29。GitHub REST API（star/fork/license SPDX/最近 push）、仓库 LICENSE/COPYING 文件原文、npm registry（版本与许可元数据）、官方文档与 Release Notes。
- 本机环境限制：github.com 网页与 git 协议直连不稳定（多次超时），因此未采用 git clone 方式核实，全部经 GitHub API 与 raw 文件通道交叉验证；版本号以 API 返回值为准。
- 关键来源示例：OnlyOffice LICENSE（github.com/ONLYOFFICE/DocumentServer）、Collabora COPYING（raw.githubusercontent.com/CollaboraOnline/online.mirror/master/COPYING）、Univer LICENSE（github.com/dream-num/univer/blob/master/LICENSE）、genoffice LICENSE 与 README「How it works」（github.com/genspark-ai/genoffice）、TabTin LICENSE（github.com/tabtin-ai/TabTin/blob/main/LICENSE）、PPTist LICENSE（github.com/pipipi-pikachu/PPTist/blob/master/LICENSE）、PPTAgent LICENSE（raw.githubusercontent.com/icip-cas/PPTAgent/main/LICENSE）、SheetJS LICENSE（raw.githubusercontent.com/SheetJS/sheetjs/master/LICENSE）、Handsontable LICENSE.txt（raw.githubusercontent.com/handsontable/handsontable/develop/LICENSE.txt）。
- 已知未尽事项：① TabTin 个别 package.json 的 MIT 标注与根 AGPL 不一致，商用前需向官方澄清；② PPTAgent 早期版本许可证历史未逐一核实（当前 main 已确认为 MIT），复用需锁定 commit；③ genoffice 引擎层未发布独立 npm 包，若未来发布应重新评估引入代价；④ SheetJS CDN 当前精确版本以 cdn.sheetjs.com 当时页面为准；⑤ Tiptap AI Toolkit 的 npm MIT 标注与订阅条款矛盾，商用前需与 Tiptap 书面确认；⑥ Univer Pro/Presenton Enterprise 等商业层报价需向厂商询价。
