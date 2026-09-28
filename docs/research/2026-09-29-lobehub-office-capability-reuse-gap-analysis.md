# LobeHub 现有实现与 Office（PPT/Excel/Word）能力的复用点与缺口分析

> - **任务**：T-567「分析 LobeHub 现有实现与 office 能力的复用点和缺口」
> - **所属 Goal**：AI Office 能力：市场全景调研、可行性分析与架构路线图（本阶段只做调研与设计，不进入产品实现）
> - **分析日期**：2026-09-29
> - **分支**：`research/ai-office-agent`，本文件位于 `docs/research/`
> - **方法**：对本仓库（`/Users/lobehub/CodeProjects/lobehub`，monorepo）真实代码的定向阅读。所有结论均附相对仓库根的文件路径与导出的 API/类型名，可逐条复核。
> - **性质**：纯现状分析报告，不含任何产品实现代码。

---

## 0. 摘要（TL;DR）

回答"做 Office 能力时我们已有什么、缺什么"：

**已有（可复用）**：
1. **一套完整的自研文档"程序化编辑"范式**：`@lobehub/editor`（Lexical，v4.27.3）+ liteXML 协议（带节点 id 的 XML 寻址 + insert/remove/modify 命令 + 人审 diff）+ `packages/editor-runtime`（计划-校验-执行-回读闭环）。这套"agent 改文档、人审后合入"的链路已经在 `lobe-page-agent` 工具上量产运行，是 LobeHub 做"AI 编辑文档"的核心资产。
2. **Office 文件站内只读预览三件套已内嵌**：FileViewer 已能用 docx-preview（docx）、`@aiden0z/pptx-renderer`（pptx）、exceljs 自研模型（xlsx）在浏览器内渲染 OOXML，可作为"生成后即时预览"的现成组件。
3. **builtin tool 五面孔框架完全就绪**：manifest/ExecutionRuntime/client executor/UI 表面/注册接线，加 manifest 级 `work` 声明（产物自动注册）、`humanIntervention` 审批机制、43 个服务端 runtime 的接线范式。新增一个 office 工具的所有框架层都是现成的。
4. **通用代码执行沙箱**：`lobe-cloud-sandbox`（13 个 API，python/js/ts + shell + 文件读写 + exportFile）+ 本地 SRT 沙箱，是"LLM 生成代码、沙箱产出真实 OOXML 文件"路线的现成执行环境。
5. **产物交付层已认识 Office 实体**：`fileEditScan` 已经能识别工具调用记录中的 office 文件生成模式（`python-pptx .save()`、`to_excel()`、`pptxgenjs writeFile`、`soffice --convert-to`、`marp -o deck.pptx` 等）并按扩展名归类为 `slides`/`sheet`/`doc` 独立 Work。

**缺失（缺口）**：
1. **零 Office 生成/编辑能力**：仓库内没有任何 office 生成库（python-pptx/python-docx/openpyxl/pptxgenjs 等，仅解析侧有 mammoth/officeparser/SheetJS）；编辑器只导出 markdown/litexml/json，无 OOXML 导出路径；FileViewer 全链路只读。
2. **无 Office 编辑回路**：所有编辑设施只读写 LobeHub 自有文档模型（`documents` 表：markdown content + Lexical editorData JSON），office 文件没有"转成可编辑文档"或原样编辑的路径；`documents` 数据模型承载不了 office 语义（分页/版式/工作表/幻灯片）。
3. **解析是单向有损的**：docx→纯文本（mammoth）、pptx→幻灯片文本、xlsx→Markdown 表格，没有可回写的文档对象模型；xlsx 进 prompt/RAG 直接降级为 Markdown 表格。
4. **预览是降级链而非能力矩阵**：xlsx 截断 500 行、整体 20MB blob 上限；旧版二进制 .doc/.ppt/.xls/.odt 强依赖 Microsoft Office Online iframe（必须公网可达 URL）。
5. **产物通道只覆盖 HTML**：artifact 类型枚举只有 Code/React/Python/HTML 四类，无 office 类型；沙箱 `exportFile` 产物只是裸文件下载。
6. **文档抽象缺"复合文档"层**：无幻灯片/工作表等版式概念（分页、页眉页脚、母版、合并单元格之外的复杂表格版式均无证据）。

**一句话结论**：LobeHub 已经拥有"AI 编辑自有文档"的完整闭环和"跑代码产文件"的沙箱，缺的是中间的"Office 语义层"——OOXML 生成/导出、可编辑文档对象模型、office 产物通道与编辑回路。

---

## 1. 分析范围与方法

按任务书四个区域定向阅读真实代码：

| 区域 | 范围 | 主要代码位置 |
|---|---|---|
| A | `@lobehub/editor` 能力边界 + `packages/editor-runtime` 封装 | `node_modules/@lobehub/editor/es/*.d.ts`、`packages/editor-runtime/src/` |
| B | 文档 features（Portal/Document、ResourceManager Editor）+ 文件/artifact 管线（FileViewer 预览链路） | `src/features/Portal/Document/`、`src/features/ResourceManager/`、`src/features/FileViewer/`、`packages/builtin-tools/` |
| C | builtin tool 体系（manifest/executor/inspector/render）+ agent-runtime 工具调用链路 | `.agents/skills/builtin-tool/`、`packages/builtin-tools/src/`、`packages/builtin-tool-*/`、`packages/agent-runtime/src/` |
| D | 文件类产物能力（云沙箱、代码产物、文档 page、文件解析） | `packages/builtin-tool-cloud-sandbox/`、`packages/device-sandbox/`、`packages/html-artifact/`、`packages/python-interpreter/`、`packages/file-loaders/`、`apps/server/src/modules/ContentChunk/`、`packages/database/src/schemas/file.ts` |

标注约定：每节末给出**复用点**与**缺口**小结；第 7、8 章为跨区域的汇总清单。

---

## 2. 现状总览（分层）

```
┌─ 展现层 ─────────────────────────────────────────────────────────┐
│ Chat 消息卡片 / Portal（Document·Artifacts）/ FileViewer 预览      │
│  - artifact 类型: Code/React/Python/HTML（无 office）            │
│  - FileViewer: docx/pptx/xlsx 只读预览 + Office Online 降级      │
├─ 工具框架层 ─────────────────────────────────────────────────────┤
│ builtin tool 五面孔: manifest → ExecutionRuntime → executor     │
│ → Inspector/Render/Streaming/Intervention/Portal + work 注册     │
│ agent-runtime: step 循环 → ToolTransport（server/client 双端）  │
├─ 执行环境层 ─────────────────────────────────────────────────────┤
│ cloud-sandbox（python/js/ts+shell+文件）/ device-sandbox(SRT)   │
│ python-interpreter（浏览器 Pyodide，仅文本输出）                  │
├─ 文档模型层 ─────────────────────────────────────────────────────┤
│ @lobehub/editor（Lexical + liteXML，json/md/litexml）           │
│ editor-runtime（plan→validate→execute→readback）                │
│ documents 表（content markdown 文本 + editorData jsonb）         │
├─ 解析层 ─────────────────────────────────────────────────────────┤
│ file-loaders / ContentChunk: docx/pptx/xlsx/pdf → 纯文本/MD 表格 │
│（单向有损，无回写模型）                                           │
└─ 存储层 ─────────────────────────────────────────────────────────┘
 files 表（元数据+S3）/ documents 表 / globalFiles 哈希去重
```

---

## 3. 区域 A：`@lobehub/editor` 与 `packages/editor-runtime`

### 3.1 `@lobehub/editor`（package.json 依赖 `^4.27.3`，实际安装 4.27.3）

基于 Meta Lexical 0.42 的富文本编辑器（独立仓库 lobehub/lobe-editor）。包入口（`node_modules/@lobehub/editor/package.json` exports）：`.`、`./react`、`./headless`、`./renderer`、`./litexml-commands`、`./codemirror`。

**导出的主要组件/Hook/类型**：
- 顶层 `es/index.d.ts`：Kernel 插件体系 —— `Kernel`、`IEditor`/`IEditorKernel`（`es/headless.d.ts`，外部 API：`setDocument/getDocument(type)`、`dispatchCommand`、`setSelection(ISelectionObject)`、`registerPlugin(s)`、`registerHotkey`、`requireService`、事件 `documentChange` 等）；`DataSource` 抽象（`read/write`）；`createHeadlessEditor`/`HeadlessEditor`；全部插件类（`TablePlugin`、`ImagePlugin`、`MathPlugin`、`MentionPlugin`、`LitexmlPlugin`、`MarkdownPlugin`、`CodeblockPlugin`、`CodemirrorPlugin`、`CollapsiblePlugin`、`LinkPlugin`、`ListPlugin`、`SlashPlugin`、`TocPlugin`、`UploadPlugin`、`YjsPlugin` 等）及对应 React 组件（`ReactTablePlugin` 等）；`extractContentBlocks`/`extractMediaLists`。
- `es/react.d.ts`：`<Editor>`（`es/react/Editor/index.d.ts`，附 `Editor.useEditor`/`useEditorState`/`withProps`）、`useEditor(options?: {autoDestroy?}): IEditor`（`es/react/hooks/useEditor.d.ts`）、`EditorProvider`/`useEditorContent`、`ChatInput`/`ChatInputActionBar`/`ChatInputActions`/`SendButton`。`EditorProps`（`es/react/Editor/type.d.ts`）支持 `editable`、`onInit(editor)`、`onChange/onTextChange`、`collaboration`（yjs 协同配置）、`mentionOption`、`slashOption`、`markdownOption`、`plugins` 注入。
- `es/renderer.d.ts`：`LexicalRenderer`（`SerializedEditorState` 只读渲染，支持 `variant: 'default'|'chat'`、`overrides`/`extraNodes` 注册表）、`LexicalDiff`（行/单元格级结构化 diff）、`createDefaultRenderers`、`loadLanguage`（shiki）。
- `es/headless.d.ts`：服务端/无 DOM 能力 —— `createHeadlessEditor(options?)` 支持 `hydrateMarkdown/hydrateLiteXML/hydrateEditorData`、`applyLiteXML(operation | operations[])`、`export({litexml?}) → { editorData, markdown, litexml? }`、`destroy`；`DEFAULT_HEADLESS_EDITOR_PLUGINS` 内置。

**支持的插件/内容类型**（`es/plugins/` 全量）：`common`（heading/quote/段落）、`markdown`、`list`、`table`（`@lexical/table`，行列插入/删除命令 + controller menu service）、`image`、`file`、`hr`、`code`、`codeblock`（shiki 高亮）、`codemirror-block`（代码卡片，mermaid 仅作为 codemirror 语言选项 + renderer 的 mermaid 渲染）、`math`（KaTeX）、`mention`、`link`/`link-highlight`（link card/iframe/schema 渲染器）、`collapsible`、`toc`、`block`（块级拖拽/`MOVE_BLOCK_COMMAND`/块菜单）、`slash`（斜杠菜单）、`toolbar`、`upload`、`auto-complete`、`content-blocks`、`virtual-block`、`litexml`、`collaboration`+`yjs`。**没有 excalidraw、思维导图、whiteboard、图表类插件。**

**文档数据类型**（`es/headless.d.ts` `HeadlessDocumentType`）：`json`（Lexical 原生）、`markdown`、`litexml`、`content-blocks`。**无 HTML 数据源；无 docx/xlsx/pptx 导入导出。**

**liteXML 是什么**：把 Lexical 文档序列化为带 `id` 属性的 XML，并定义程序化编辑协议：
- `LitexmlDataSource` 在 XML ↔ Lexical 间双向转换（`es/plugins/litexml/data-source/litexml-data-source.d.ts`）；
- 命令（`es/plugins/litexml/command/symbols.d.ts`，单独打成 `./litexml-commands` 入口，可服务端安全 import）：`LITEXML_MODIFY_COMMAND`（insert beforeId/afterId、remove id、modify litexml[]）、`LITEXML_APPLY_COMMAND`、`LITEXML_REMOVE_COMMAND`、`LITEXML_INSERT_COMMAND`、`LITEXML_DIFFNODE_COMMAND`/`_ALL_COMMAND`；
- `delay?: boolean` 参数开启"待定稿"模式：产生 `DiffNode`（diffType: add/remove/modify/listItemAdd…），UI 上 accept/reject 后合入；
- `ILitexmlService` 允许插件注册自定义 XML reader/writer 扩展新节点类型。

### 3.2 `packages/editor-runtime`（`@lobechat/editor-runtime`，1.0.0）

仅依赖 `@lobechat/prompts`（取 `PageContentContext` 类型），通过 `@lobehub/editor` + `@lobehub/editor/litexml-commands` 操作编辑器。唯一使用方是 `packages/builtin-tool-page-agent`。**这是"agent 编辑文档"运行时的封装样板。**

公开 API（`src/index.ts` 导出 `EditorRuntime`、`LiteXMLBatchOperation`、`formatModifyNodesResult`、liteXMLEditPlan 全部、`types` 全部）：

- 构造与注入（`src/EditorRuntime.ts`）：`new EditorRuntime()`；`setEditor(editor: IEditor | null)`、`setCurrentDocId/getCurrentDocId`、`setTitleHandlers(setter, getter)`、`setBeforeMutateHandler/setAfterMutateHandler`（变更前存档/变更后持久化）、`getDebugSnapshot()`、`isReady()`。
- 四个变异/查询 API（均 async，对应 page agent 工具）：
  - `initPage(args: InitDocumentArgs): Promise<InitPageRuntimeResult>` —— 从 markdown 建文档，`# ` 首行抽标题，`editor.setDocument('markdown', md, {keepId: true})`；
  - `editTitle(args: EditTitleArgs)`；
  - `getPageContent(args)` / `getPageContentContext(format='both'): PageContentContext` —— 输出 `{title, markdown?, xml?, charCount, lineCount, documentId}`，xml 即 litexml，是给 LLM 的结构化寻址格式；
  - `modifyNodes(args: ModifyNodesArgs): Promise<ModifyNodesRuntimeResult>` —— 批量 insert/remove/modify；
  - `replaceText(args: ReplaceTextArgs)` —— litexml 字符串级查找替换（保留 XML 标签，仅替换文本段）。
- 编辑计划（`src/liteXMLEditPlan.ts`，纯函数）：`planLiteXMLEditSteps(operations, document): LiteXMLEditStep[]` —— `indexLiteXMLDocument`（正则解析出 `{ids, ancestorIds, listIds}`）、同 anchor 的 after-insert 合并、混合 list/non-list 拆分、重叠目标整单拒绝；`findLiteXMLEditStepProblem(op, doc)` 前置校验；`touchesList` 决定是否跳过 review diff（**触及列表的编辑强制直接应用，因为编辑器列表 diff 会丢结构——这是已知坑**）。

### 3.3 区域 A 小结

**复用点**：
- A-1 liteXML 协议 = "结构化文档程序化编辑 + 人审 diff"的完整协议（寻址、命令、待定稿、accept/reject），可直接承载 LobeHub 自有文档模型的 AI 编辑，无需新造协议。
- A-2 `EditorRuntime` 的 plan→validate→execute→readback 闭环（含 `formatModifyNodesResult` 生成给 LLM 的重试提示）是 agent 文档工具执行器的直接模板。
- A-3 headless 编辑器可在服务端做 markdown→文档、litexml→文档的转换与校验。
- A-4 编辑器自带 yjs 协同、mention、slash、表格、上传等富能力，"人在环编辑"的 UI 基础完整。

**缺口**：
- A-5 无 OOXML（docx/xlsx/pptx）导入/导出数据源；编辑器文档类型只有 json/markdown/litexml/content-blocks。
- A-6 `modifyNodes` 以顶层块节点为单位，无文本级 range 编辑 API（`replaceText` 是节点内全文替换）；无表格单元格级寻址命令。
- A-7 无版式概念：无分页、页眉页脚、分栏、母版等节点类型；表格为 `@lexical/table` 基础表。
- A-8 无幻灯片/工作表等复合文档抽象；无 excalidraw/图表/思维导图类内容插件。

---

## 4. 区域 B：文档 features 与文件预览链路

### 4.1 `src/features/Portal/Document` —— 文档 Portal 全链路

- 编辑器来源：`EditorCanvas.tsx` 用 `useEditor()`（`@lobehub/editor/react`）渲染共享 `EditorCanvas`（`src/features/EditorCanvas`，`InternalEditor.tsx` 插件栈含 `ReactLiteXmlPlugin`）；`Wrapper.tsx` 用 `EditorProvider` 包裹。
- 数据模型：`packages/database/src/schemas/file.ts` 的 `documents` pgTable —— `content`（text，markdown）、`editorData`（jsonb，Lexical 状态）、`title/filename/fileType`、`metadata` jsonb、`sourceType` enum（`file/web/api/topic/agent/agent-signal`）、`parentId` 树形。**自有文档模型 = markdown content + Lexical editorData JSON。**
- 保存链路：编辑器变更 → zustand `useDocumentStore` → `performSave`（`src/features/EditorCanvas/DocumentIdMode.tsx`）→ `documentService.updateDocument`（`src/services/document/index.ts`）→ tRPC → `apps/server/src/routers/lambda/document.ts`（`document:update` 权限、乐观并发）。
- 渲染三分支（`src/utils/documentRenderMode.ts`）：`file`（只读预览原文件）/ `editor`（富文本）/ `highlight`（源码编辑）。
- 路由：`/agent/:aid/docs/:docId` 与 `/page/:id`（`src/spa/router/desktopRouter.shared.tsx`）；Portal 注册 `src/features/Portal/router.tsx`。

### 4.2 ResourceManager 的"Editor"

- `src/features/ResourceManager/index.tsx` 三种 mode：`editor` / `explorer` / `page`。
- mode=`editor` → `FileEditor`（`src/features/ResourceManager/components/Editor/index.tsx`）→ `FileContent.tsx` → **`FileViewer`（只读预览，头部只有返回/下载/详情）**。
- mode=`page` → `PageEditor`（`@/features/PageEditor`）→ 用 `EditorCanvas` 富文本编辑知识库 Page。
- **结论：ResourceManager 的"编辑"只覆盖自有 page/notebook 文档；文件类资源打开的是预览器。**

### 4.3 FileViewer —— 文件类型 → 渲染器映射（穷尽清单）

总入口 `src/features/FileViewer/index.tsx`：

| 文件类型 | 判定 | 渲染组件 | 底层实现 |
|---|---|---|---|
| PDF | `.pdf` | `Renderer/PDF/index.tsx` | react-pdf + pdfjs-dist（`src/libs/pdfjs`），带聊天气泡高亮层 |
| 图片 | `.jpg/.jpeg/.png/.webp/.gif/.bmp` + `image/*` | `Renderer/Image` | — |
| 视频 | `.mp4/.webm/.ogg` + `video/*` | `Renderer/Video` | — |
| 压缩包 | `.zip/.rar/.7z/.tar/.gz/...` | `NotSupport`（明确不支持） | — |
| **Office（MSDoc）** | `.doc/.docx/.odt/.ppt/.pptx/.xls/.xlsx` + 对应 MIME（`index.tsx` `MSDOC_EXTENSIONS`） | `Renderer/MSDoc/index.tsx` → blob 下载（**20MB 上限**）→ `Renderer/Document/index.tsx` | 分行见下 |
| — docx | `wordprocessingml.document` | `Renderer/Document/DocxPane.tsx` | **docx-preview** + 章节导航 |
| — pptx | `presentationml.presentation` | `Renderer/Document/PptxPane.tsx` | **`@aiden0z/pptx-renderer`**（缩略图/缩放/文本搜索） |
| — xlsx | `spreadsheetml.sheet` | `Renderer/Document/xlsx/XlsxPane.tsx` → `SheetGrid`（保真）/ `SheetDocument`（重排） | **exceljs 自研模型**（`xlsx/model.ts`），`MAX_PREVIEW_ROWS=500` 截断 |
| — 旧版 .doc/.ppt/.xls/.odt | — | `Renderer/Document/OfficeOnlinePane.tsx` | **iframe 嵌 Microsoft `view.officeapps.live.com`**（要求公网可达 URL） |
| HTML | `isHtmlFile` | `Renderer/HTML` | 沙箱 iframe |
| Markdown | `.md/.mdx/.markdown` | `Renderer/Markdown` | 富文本 + 源码切换 |
| **fallback** | 其余全部 | `Renderer/Code` | 字节探测文本→代码高亮；二进制→下载视图 |

降级链（`Renderer/MSDoc/index.tsx` 与 `Renderer/Document/index.tsx`）：blob 拿不到（>20MB/URL 不可达）但有 url → OfficeOnlinePane；OOXML 渲染抛错 → 有 sourceUrl 降级 Office Online，否则下载/Electron 用系统默认应用打开。消费方还有 `FileDocumentPreview`（Portal 文档 file 模式）、`src/features/Portal/LocalFile/Body.tsx`。

### 4.4 Artifact 体系

- 无 `src/features/Artifact*` 目录；相关：`src/features/Portal/Artifacts/` + `src/features/Conversation/Markdown/plugins/LobeArtifact/`（消息内卡片）。
- 类型枚举 `packages/types/src/artifact.ts`：`Code` / `React`（`application/lobe.artifacts.react`）/ `Python` / `Default('html')` —— **全部是代码/标记类，无 doc/page/office 类型**。
- Portal 渲染器 `src/features/Portal/Artifacts/Body/Renderer/index.tsx`：react（动态执行）/ svg / mermaid / text·markdown / 默认 HTML。

### 4.5 区域 B 小结

**复用点**：
- B-1 docx/pptx/xlsx 站内只读预览组件已内嵌（docx-preview / `@aiden0z/pptx-renderer` / exceljs 自研模型），"生成 office 文件后即时预览"不需要从零造渲染器。
- B-2 `EditorCanvas` + Document Portal + 保存链路（乐观并发）是"自有文档在线编辑"的完整参考实现。
- B-3 FileViewer 的类型判定与降级链结构可直接扩展新的 office 渲染/编辑模式。

**缺口**：
- B-4 零 Office 编辑能力：office 文件在 FileViewer 里只能预览/下载，无"转换成可编辑文档"或原样编辑路径；所有编辑设施只读写自有 `documents` 模型。
- B-5 预览上限：xlsx 500 行截断、20MB blob 上限；旧格式强依赖外网 Office Online（私有/本地文件不可用 + 可达性问题）。
- B-6 Artifact 类型枚举无 office；agent 产出的 office 文件只能走 FileViewer 预览链路，无产物卡片/版本/在线编辑回路。

---

## 5. 区域 C：builtin tool 体系与 agent 工具调用链路

### 5.1 体系结构（技能文档 + 注册表 + 调用链）

技能文档 `.agents/skills/builtin-tool/SKILL.md` 定义"五面孔"：`manifest+types+systemRole`（给 LLM）/ `ExecutionRuntime`（无 React 纯逻辑，构造函数注入 service）/ `client executor`（前端接线）/ `client UI`（Inspector 必需，Render/Streaming/Placeholder/Intervention/Portal 按需）/ registry wiring。identifier `lobe-<domain>` 永久不变（存进消息历史）；结果三分法 `content`（给 LLM）/`state`（给 UI pluginState）/`error`。

数据流（每环给文件路径与导出名）：

```
① Manifest: packages/builtin-tool-<name>/src/manifest.ts → XxxManifest: BuiltinToolManifest
   （类型: packages/types/src/tool/builtin.ts；{ identifier, api: LobeChatPluginApi[],
      systemRole, meta, executors?, humanIntervention? }）
   → packages/builtin-tools/src/index.ts → builtinTools + defaultToolIds/alwaysOnToolIds/
     chatModeAllowedToolIds/runtimeManagedToolIds/AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS
② 生成给模型的 schema: packages/mecha/src/toolSet/manifestPool.ts → assembleManifestPool()
   packages/context-engine/src/engine/tools/utils.ts → generateToolsFromManifest(manifest)
③ 模型 tool_call → 执行:
   packages/agent-runtime/src/core/runtime.ts → class AgentRuntime.step()
   packages/agent-runtime/src/agents/GeneralChatAgent.ts → call_llm → 按 intervention 分流
     （免审批 call_tools_batch / 需审批 request_human_approve / 无工具 finish）
   packages/agent-runtime/src/executors/tool.ts → callTool/callToolsBatch
     （planBatchLanes 按 ordered/serializeBy 并发；pauseForTools 挂起 client/异步工具）
   packages/agent-runtime/src/transport/tool.ts → interface ToolTransport
   服务端: apps/server/src/modules/AgentRuntime/adapters/ServerToolTransport.ts
     （source='client' → dispatchClientTool；lobehubSkill → MarketService；
      其余 builtin → BuiltinToolsExecutor（apps/server/src/services/toolExecution/builtin.ts）
      → getServerRuntime(identifier, ctx)（apps/server/src/services/toolExecution/serverRuntimes/index.ts，43 个 runtime））
   前端: src/store/tool/slices/builtin/executors/index.ts → invokeExecutor
     → 各包 client/executor/ 的 BaseExecutor 子类（packages/types/src/tool/builtin.ts）
④ 结果渲染: packages/builtin-tools/src/register.ts → registerBuiltinToolSurfaces()
   renders.ts / streamings.ts / inspectors.ts / placeholders.ts / interventions.ts /
   portals.ts（全屏详情视图）/ displayControls.ts，均按 identifier(+apiName) 映射
⑤ 人工介入: manifest api[].humanIntervention + packages/agent-runtime/src/core/InterventionChecker.ts
   → shouldIntervene()（DEFAULT_SECURITY_BLACKLIST 优先）+ dynamicInterventionAudits.ts 动态 resolver
```

### 5.2 现有 builtin tool 包清单（37 个，`packages/builtin-tool-*/`）

acceptance-evidence, activator, agent-builder, agent-documents, agent-management, agent-signal, attachments, auv, brief, browser, calculator, claude-code, cloud-sandbox, creds, goal, group-agent-builder, group-management, image-generation, knowledge-base, lobe-agent, local-system, memory, message, notebook（已废弃，被 agent-documents 取代）, page-agent, remote-device, self-iteration, skill-maintainer, skill-store, skills, task, topic-reference, user-interaction, verify, video-generation, web-browsing, web-onboarding。（codex/github/linear/twitter/kimiCode 等异构 CLI 工具的 UI 直接在 `packages/builtin-tools/src/<dir>/` 内，非独立包。）

**没有 office 专用工具。** 相邻能力：
- `lobe-local-system`：writeFile/editFile/readFile（readFile 支持 pdf/docx 文本抽取）；
- `lobe-cloud-sandbox`：`executeCode` 可用 python-pptx/python-docx/openpyxl 生成 office 文件（见区域 D）；
- **`packages/builtin-tools/src/fileEditScan/`**：扫描持久化工具调用记录（cloud-sandbox/local-system 的 writeFile/editFile、codex file_change、claude-code Edit/Write 及 shell 命令文本启发式），**明确识别 `marp -o deck.pptx`、`soffice --convert-to`、`python-pptx/.save()`、`to_excel()`、`pptxgenjs writeFile` 等 office 生成模式**（`fileEditScan/index.ts`），按扩展名分类（ppt/pptx→`slides`、xlsx→`sheet`、docx→`doc`），entity 类文件各自注册独立 Work —— **产物交付层已有 slides/sheet/doc 实体概念**；
- manifest 的 `work: { resourceType: 'document'|'task', action }` 声明式 Work 注册机制已就绪。

### 5.3 一个 tool 包的标准结构

以 local-system / cloud-sandbox / web-browsing 为代表：

```
packages/builtin-tool-<name>/
├── package.json          # exports: { ".": manifest/types/systemRole, "./client",
│                         #           "./executor": client/executor, "./executionRuntime" }
└── src/
    ├── index.ts          # Manifest + Identifier + types + systemRole（无 React）
    ├── manifest.ts       # api[] 每项含 JSON Schema parameters
    ├── types.ts          # XxxApiName as const 对象 + Params/State 接口
    ├── systemRole.ts     # 教模型何时/如何调用
    ├── resolveManifest.ts# 可选，按上下文裁剪 api[]
    ├── ExecutionRuntime/ # 纯运行时，构造函数注入 service
    └── client/
        ├── executor/index.ts   # class XxxExecutor extends BaseExecutor<typeof ApiName>
        ├── Inspector/          # 必需
        └── Render/ Streaming/ Placeholder/ Intervention/ Portal/  # 按需
```

### 5.4 新增一个"生成/编辑 Office 文件"builtin tool 需要动的层（事实清单）

1. 新包 `packages/builtin-tool-office/`（manifest/types/systemRole/ExecutionRuntime/client executor/Inspector + 按需 UI）。
2. 中央注册：`packages/builtin-tools/src/index.ts` + `identifiers.ts`；同步 `defaultToolIds`/`alwaysOnToolIds`/`chatModeAllowedToolIds`/`runtimeManagedToolIds` 及分享门禁 `AGENT_SHARE_ALLOWED_BUILTIN_IDENTIFIERS`。
3. 服务端 runtime：`apps/server/src/services/toolExecution/serverRuntimes/` 新增并注册（否则抛 `Builtin tool "lobe-office" is not implemented`）。
4. 前端 executor 接线：`src/store/tool/slices/builtin/executors/index.ts`。
5. UI 表面注册：`packages/builtin-tools/src/register.ts`；全屏预览（如 slides 播放）走 `portals.ts`。
6. 产物入 Work：api[].`work` 声明式注册；fileEditScan 的 office 识别可兜底。
7. i18n：`packages/locales/src/default/plugin.ts` 的 `builtins.lobe-office.apiName.*` + en-US/zh-CN 手写。
8. 动态审批（可选）：`dynamicInterventionAudits.ts` 注册 resolver。

**替代路径（事实）**：cloud-sandbox 已具备 executeCode + 文件 API 全家桶；若只需"能生成 Office 文件"而非独立工具语义，扩展现有 sandbox API 或仅靠 fileEditScan 识别即可，无需新 identifier（identifier 永久存于消息历史，新增需谨慎）。

### 5.5 区域 C 小结

**复用点**：
- C-1 五面孔工具框架 + 43 个服务端 runtime 接线范式完全就绪，新增 office 工具是纯增量工作。
- C-2 manifest 级 `work` 声明 + `humanIntervention` 审批 + 动态审批 resolver，覆盖"产物注册/危险操作审批"需求。
- C-3 fileEditScan 已认识 office 产物实体并注册 Work（slides/sheet/doc），产物交付语义已存在。
- C-4 client/server 双端 executor 机制（`BaseExecutor`、`invokeExecutor`）支持重前端交互的 office 工具（如可视化编辑确认）。

**缺口**：
- C-5 无 office 专用工具 identifier 与 apiName 体系（生成/编辑/导出 pptx/xlsx/docx 均无）。
- C-6 无 office 工具的系统提示（systemRole）与 JSON Schema 参数约定。
- C-7 工具卡片 UI（Inspector/Render/Portal）无 office 场景设计（编辑确认 diff、播放预览等）。

---

## 6. 区域 D：文件类产物能力与 Office 需求的差距

### 6.1 云沙箱 `packages/builtin-tool-cloud-sandbox/`（builtin tool `lobe-cloud-sandbox`）

- Manifest 声明 13 个 apiName（`src/types/api.ts`）：`executeCode`（python/js/ts，`humanIntervention: 'required'`）、`runCommand`（shell，默认 120s，支持后台）、`getCommandOutput`/`killCommand`、`listFiles`/`readFile`/`writeFile`/`editFile`/`moveFiles`（写/编辑需审批，按 path 串行化）、`searchFiles`/`globFiles`/`grepContent`、`exportFile`（pre-signed URL → 持久 `/f/:id` 文件记录）。
- 执行链路：client executor → `CloudSandboxExecutionRuntime extends ComputerRuntime`（`@lobechat/tool-runtime`）→ `cloudSandboxService` → tRPC `toolsClient.market.execInSandbox`。
- 服务端 `apps/server/src/services/sandbox/`（`createSandboxService`）：`MarketSandboxProvider`（market SDK 远程）与 `OnlyboxesSandboxProvider`（自建，`ONLYBOXES_BASE_URL`），capabilities 均为 `python/js/ts + shell + files + exportFile + persistentSession + skillScripts`。
- **网络策略不在仓库内**（远端云侧控制）；manifest meta 明确"HTML/SVG 导出需显式下载请求，自包含网页建议走 artifacts skill"——无任何 office 专用 apiName 或系统提示引导。
- 已有文件可注入沙箱：`FileModel` 暴露 `SandboxInitFileItem`（`packages/database/src/models/file.ts`）。

### 6.2 本地设备沙箱 `packages/device-sandbox/`

基于 Anthropic `@anthropic-ai/sandbox-runtime`（SRT）的桌面本地 shell 沙箱：macOS Seatbelt / Linux / Windows。写限制在 cwd + 临时目录；**网络默认拒绝**，可选 allowlist `LOCAL_SANDBOX_NETWORK_DOMAINS`（`src/presets.ts`）——仅 npm/pypi/crates/go/rubygems registry + github/gitlab。**装包受 registry allowlist 约束。**

### 6.3 代码/HTML 产物 `packages/html-artifact/`

只做 HTML 单页应用产物。导出（`src/index.ts`）：`gatherWorkspaceHtmlArtifact`、`packWorkspaceHtmlDocument`、`collectHtmlLocalResources`、`publishWorkspaceHtmlArtifact`/`wrapWorkspaceHtmlArtifact`（生成 `<lobe-artifact type="text/html">` 标签）、`extractHtmlTitle`。限制（`src/limits.ts`）：单文件 ≤50MB、总 ≤50MB、≤64 文件。消费方：SPA `src/features/Portal/LocalFile/`、`src/components/HtmlPreview/`、CLI `apps/cli/src/commands/artifact.ts`；聊天里 `<lobe-artifact>` 由 `LobeArtifact` rehype plugin 解析，HTML 走 `@lobehub/ui` `HtmlPreview`（sandbox iframe + srcdoc）。**产物通道只覆盖 HTML。**

### 6.4 Python 解释器 `packages/python-interpreter/`

浏览器内 Pyodide（WASM，`pyodide@0.28.3` + comlink worker）。导出 `getPythonInterpreter`。**产物只有文本输出，无文件产物通道。**

### 6.5 文件解析管线（docx/xlsx/pptx/pdf → 文本）

两套并存，**均为单向有损文本抽取，无可回写文档对象模型**：

- **知识库 chunking（主流程）**：`apps/server/src/modules/ContentChunk/index.ts` → `ChunkingLoader.partitionContent`。docx：`mammoth.extractRawText` 纯文本；pptx：解 zip 取 slide XML 文本；xlsx：SheetJS 转 **Markdown 表格**（`packages/file-loaders` 的 ExcelLoader，每 sheet 一个 DocumentPage）；pdf：pdfjs-dist；可选 unstructured 服务（需环境变量）。输出 `DocumentChunk` → embedding/RAG。
- **完整文档加载 `@lobechat/file-loaders`**：`SupportedFileType = 'pdf'|'doc'|'docx'|'txt'|'excel'|'pptx'|'ipynb'`（`src/types.ts`），导出 `getFileLoader`/`loadFile`/`FileDocument`/`DocumentPage`。依赖：mammoth、officeparser 5.1.1、pdfjs-dist、xlsx（SheetJS）、word-extractor、yauzl。消费方：`apps/server/src/services/document/index.ts`、`apps/desktop`。

### 6.6 数据模型（`packages/database/src/schemas/file.ts`）

- `documents` 表：`content`（纯文本）、`fileType/filename`、`metadata` jsonb、`pages` jsonb（`LobeDocumentPage[]`：charCount/lineCount/metadata/pageContent —— **只有文本+统计，无富文本/块结构**）、`sourceType`、`parentId`、`editorData` jsonb（无 schema 定型）、`slug/visibility`。
- `files` 表：`fileType`(mime)、`fileHash`（sha256→`globalFiles`）、`size`、`url`(S3)、`source`、`parentId`（→documents）、`metadata` jsonb、`chunkTaskId/embeddingTaskId`。
- **承载不了 Office 语义**：无分页版式、工作表、幻灯片、样式、公式等结构。

### 6.7 区域 D 小结

**复用点**：
- D-1 cloud-sandbox = "LLM 生成代码→沙箱执行→产出真实 OOXML 文件"的现成执行环境（python-pptx/docx/openpyxl 路线），含文件读写、持久会话、导出为平台文件。
- D-2 device-sandbox 提供本地受控 shell（soffice --convert-to 类命令的理论执行点，网络受限）。
- D-3 html-artifact 的"产物打包/发布/卡片"范式（虽然只针对 HTML）是 office 产物通道设计的直接参考。
- D-4 解析管线（mammoth/officeparser/SheetJS/pdfjs）可用于 office→自有文档的单向导入。
- D-5 `exportFile` → `/f/:id` 平台文件 + FileViewer 预览，构成"沙箱产物→可预览文件"的最小闭环。

**缺口**：
- D-6 仓库内无任何 office 生成库依赖；沙箱内能否装包：云沙箱网络策略无本地事实依据，桌面沙箱受 registry allowlist 约束。
- D-7 解析单向有损：无版式/样式/图表/图片/合并单元格/公式保留，无回写模型。
- D-8 产物通道只覆盖 HTML；office 产物只是裸文件下载，无产物卡片/版本/在线编辑。
- D-9 xlsx 在 chat/RAG 链路降级为 Markdown 表格，无 workbook 结构。

---

## 7. 可复用点清单（汇总）

| # | 复用点 | 代码位置 | 对 Office 能力的意义 |
|---|---|---|---|
| R1 | liteXML 程序化编辑协议（寻址/命令/人审 diff） | `@lobehub/editor` `es/plugins/litexml/`、`./litexml-commands` | 自有文档模型的 AI 编辑协议，无需新造 |
| R2 | `EditorRuntime` plan→validate→execute→readback 闭环 | `packages/editor-runtime/src/EditorRuntime.ts`、`liteXMLEditPlan.ts` | office 文档工具执行器的直接模板 |
| R3 | headless 编辑器（服务端 markdown/litexml 转换校验） | `@lobehub/editor` `es/headless.d.ts` `createHeadlessEditor` | 服务端文档生成/校验 |
| R4 | 富文本编辑器全插件栈（表格/图片/数学/代码/协同/mention/slash/上传） | `@lobehub/editor` `es/plugins/`、`src/features/EditorCanvas/InternalEditor.tsx` | 人在环编辑 UI 基础 |
| R5 | 文档 Portal + 保存链路（乐观并发） | `src/features/Portal/Document/`、`apps/server/src/routers/lambda/document.ts` | 文档编辑产品化参考 |
| R6 | OOXML 只读预览三件套 | `src/features/FileViewer/Renderer/Document/`（DocxPane/PptxPane/XlsxPane） | 生成后即时预览组件现成 |
| R7 | builtin tool 五面孔框架 | `.agents/skills/builtin-tool/SKILL.md`、`packages/builtin-tools/src/` | 新增 office 工具纯增量 |
| R8 | manifest `work` 声明式产物注册 + `humanIntervention` 审批 | `packages/types/src/tool/builtin.ts`、`agent-runtime/src/core/InterventionChecker.ts` | 产物交付与危险操作审批 |
| R9 | fileEditScan office 实体识别（slides/sheet/doc → Work） | `packages/builtin-tools/src/fileEditScan/index.ts` | 交付层已有 office 实体概念 |
| R10 | cloud-sandbox 通用代码执行 + 文件 API + exportFile | `packages/builtin-tool-cloud-sandbox/`、`apps/server/src/services/sandbox/` | "代码生成 OOXML" 路线的执行环境 |
| R11 | device-sandbox 本地受控 shell | `packages/device-sandbox/` | 本地 office 命令执行点 |
| R12 | html-artifact 产物打包/发布/卡片范式 | `packages/html-artifact/src/` | office 产物通道设计参考 |
| R13 | office→文本解析管线（导入侧） | `apps/server/src/modules/ContentChunk/`、`packages/file-loaders/` | office 文件单向导入自有模型 |
| R14 | 平台文件系统（S3 + 元数据 + 哈希去重） | `packages/database/src/schemas/file.ts`、`files`/`globalFiles` 表 | office 产物存储底座 |
| R15 | client/server 双端 executor + ToolTransport 抽象 | `packages/agent-runtime/src/transport/tool.ts`、ServerToolTransport | 重交互 office 工具的执行框架 |

## 8. 缺口清单（汇总，按影响排序）

| # | 缺口 | 证据 | 影响 |
|---|---|---|---|
| G1 | 无 Office 生成库与专用工具面（python-pptx/docx/openpyxl/pptxgenjs 均无） | monorepo 依赖仅解析侧（mammoth/officeparser/SheetJS）；无 office builtin tool（区域 C/D） | 生成 office 文件只能靠沙箱内现装库 |
| G2 | 无 OOXML 导出：编辑器仅导出 markdown/litexml/json | `@lobehub/editor` `HeadlessDocumentType`；editor-runtime `getPageContent` | 自有文档模型 → office 格式无路径 |
| G3 | 无 Office 编辑回路：FileViewer/ResourceManager 全只读；编辑设施只读写自有 documents 模型 | `src/features/ResourceManager/components/Editor/index.tsx` → FileViewer；`documentRenderMode.ts` | "编辑 office 文件"无任何产品形态 |
| G4 | documents 数据模型承载不了 Office 语义（分页/版式/工作表/幻灯片/样式） | `packages/database/src/schemas/file.ts`、`LobeDocumentPage` 仅文本+统计 | 存储层需要新模型或外挂 |
| G5 | 解析单向有损、无可回写文档对象模型 | `mammoth.extractRawText`、ExcelLoader sheetToMarkdownTable | office→自有模型是"导入"而非"转换" |
| G6 | artifact 类型枚举无 office，产物通道只覆盖 HTML | `packages/types/src/artifact.ts`；`packages/html-artifact/src/limits.ts` | agent 产 office 文件无产物卡片/版本/编辑回路 |
| G7 | 预览能力上限与外部依赖：xlsx 500 行截断、20MB blob 上限、旧格式靠 Office Online 公网 iframe | `src/features/FileViewer/Renderer/Document/`、`OfficeOnlinePane.tsx` | 大文件/旧格式/私有部署体验受限 |
| G8 | xlsx 进 prompt/RAG 降级为 Markdown 表格，无 workbook 结构 | `packages/file-loaders` ExcelLoader | 表格类 agent 分析丢结构 |
| G9 | 沙箱网络策略：云沙箱装包能力无本地事实依据；桌面沙箱 registry allowlist 约束 | `apps/server/src/services/sandbox/`（远端控制）；`packages/device-sandbox/src/presets.ts` | "代码生成 OOXML"路线的环境可行性待验证 |
| G10 | 文档抽象无"复合文档"层：无幻灯片/工作表/版式（分页、页眉页脚、母版、复杂表格）概念 | `@lobehub/editor` 插件清单无相关节点 | 演示/表格类产品的数据模型需新建 |
| G11 | 编辑器无 range 级/单元格级程序化编辑 API | `packages/editor-runtime` modifyNodes 顶层块粒度；table 命令仅作用于选区 | 精细 diff 编辑（如"改第 3 页第 2 个单元格"）缺协议 |

## 9. 方向性观察（仅事实支撑，不做产品结论）

1. **两条现成路线的事实基础**：①"代码生成 OOXML"路线已有 cloud-sandbox + fileEditScan 识别 + FileViewer 预览的完整链路边界（G1/G9 是主要不确定项）；②"自有文档模型 AI 编辑"路线已有 liteXML + editor-runtime 的量产闭环（G2/G4 是其与 office 互通的断点）。
2. **缺口集中在"Office 语义层"**：G2/G4/G5/G6/G10 共同指向同一个事实——LobeHub 现有栈的所有文档抽象都以"markdown/Lexical 块文档"为终点，没有任何一层能表达或转换 office 的结构化语义。
3. **框架层不是瓶颈**：工具框架（C 区）、执行环境（D 区）、预览组件（B 区）均为纯增量改造，架构路线设计的主要决策点在文档模型与格式转换层。

## 10. 附录：关键文件索引

| 主题 | 路径 |
|---|---|
| editor 依赖声明 | `package.json`（`@lobehub/editor: ^4.27.3`） |
| editor-runtime 封装 | `packages/editor-runtime/src/{EditorRuntime,liteXMLEditPlan,types,formatModifyNodesResult}.ts` |
| 文档 Portal | `src/features/Portal/Document/{EditorCanvas,Body,Wrapper,documentViewContext}.tsx` |
| 共享编辑器画布 | `src/features/EditorCanvas/InternalEditor.tsx` |
| 文档保存服务/路由 | `src/services/document/index.ts`、`apps/server/src/routers/lambda/document.ts` |
| ResourceManager | `src/features/ResourceManager/{index.tsx,components/Editor/index.tsx}` |
| FileViewer | `src/features/FileViewer/{index.tsx,fileType.ts}`、`src/features/FileViewer/Renderer/{MSDoc,Document/{DocxPane,PptxPane,xlsx/XlsxPane,OfficeOnlinePane}}.tsx` |
| Artifact 类型/渲染 | `packages/types/src/artifact.ts`、`src/features/Portal/Artifacts/Body/Renderer/index.tsx` |
| builtin tool 框架 | `.agents/skills/builtin-tool/SKILL.md`、`packages/builtin-tools/src/{index,register,identifiers,renders,streamings,inspectors,portals,displayControls,interventions}.ts`、`packages/builtin-tools/src/fileEditScan/` |
| tool 类型 | `packages/types/src/tool/builtin.ts`（`BuiltinToolManifest`、`BaseExecutor`） |
| agent 调用链 | `packages/agent-runtime/src/{core/runtime.ts,agents/GeneralChatAgent.ts,executors/{tool,humanApprove}.ts,core/InterventionChecker.ts,transport/tool.ts}` |
| 服务端执行 | `apps/server/src/modules/AgentRuntime/adapters/ServerToolTransport.ts`、`apps/server/src/services/toolExecution/{builtin.ts,serverRuntimes/index.ts}` |
| 前端执行 | `src/store/tool/slices/builtin/executors/index.ts` |
| schema 生成 | `packages/mecha/src/toolSet/manifestPool.ts`、`packages/context-engine/src/engine/tools/utils.ts` |
| 云沙箱 | `packages/builtin-tool-cloud-sandbox/src/{manifest.ts,types/api.ts,ExecutionRuntime/}`、`apps/server/src/services/sandbox/factory.ts` |
| 本地沙箱 | `packages/device-sandbox/src/presets.ts` |
| HTML 产物 | `packages/html-artifact/src/{index.ts,limits.ts}` |
| 解析管线 | `apps/server/src/modules/ContentChunk/index.ts`、`packages/file-loaders/src/types.ts`、`apps/server/src/libs/document-loaders/loaders/` |
| 数据模型 | `packages/database/src/schemas/file.ts`（`documents`/`files`/`globalFiles` 表） |
