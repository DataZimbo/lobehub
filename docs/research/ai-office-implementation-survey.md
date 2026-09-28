# 主流商业 AI 办公产品 Office（PPT/Excel/Word）实现思路调研报告

> - 任务：T-565「调研主流商业 AI 办公产品的 office 实现思路」
> - 所属 Goal：AI Office 能力：市场全景调研、可行性分析与架构路线图（本阶段只做调研与设计，不进入产品实现）
> - 调研日期：2026-09-29
> - 标注约定：**【事实】** = 有公开来源直接支持（链接随文标注）；**【推测】** = 基于公开信息的合理推断；**「未找到公开资料」** = 如实留白，不做臆断。

---

## 0. 摘要

本轮对 11 个指定对象（Microsoft 365 Copilot / Office Agent、Google Workspace + Gemini、WPS AI、Notion AI、Gamma、Tome、Canva Magic Design、ChatGPT、Claude、Genspark、Manus）加 3 个上一轮对象（OpenAI Codex、TabTin、GenOffice）加 5 组补充对象（飞书、钉钉、腾讯文档、国内 AI PPT 工具、Beautiful.ai/Plus AI）做了实现思路调研。核心发现：

1. **文档模型四条路线并存**：原生 OOXML 对象模型（Microsoft、WPS、ChatGPT/Claude 沙箱产物、Plus AI）；自研 JSON block 树（Notion、飞书 docx、钉钉、Gamma card、Canva 场景树、TabTin 在线文档）；自研网格模型（Google Sheets、腾讯文档）；以代码/Markdown 为文档（Claude Artifacts、ChatGPT 写作块）。
2. **生成方式三条主路线**：① LLM 直接操作文档模型 / 应用 API（Microsoft Agent Mode、WPS 灵犀、Gemini in Docs、Notion、飞书智能伙伴）；② LLM 生成代码再沙箱执行、产出真实 OOXML（Claude file creation、ChatGPT agent/Data Analyst、Codex、Manus 的 CodeAct 范式、Gemini in Sheets 的 Python 分析）；③ 模板填充 / RAG 匹配（Canva Magic Design 早期、AiPPT、Beautiful.ai 规则引擎、Gamma 的 Smart Layouts 属"AI 产出结构 + 布局引擎"混合体）。
3. **交互范式五条**：侧边栏对话、inline 划词编辑、预览-确认流（大纲确认、改动前请示）、agent 自主规划执行（2025 下半年起成为旗舰形态）、对话式问数（表格场景专属）。
4. **可编辑性 vs 视觉质量是公开承认的核心矛盾**：图片渲染路线视觉上限高但不可编辑；OOXML 直接生成可编辑但排版平庸。头部厂商的差异化投入集中在"生成后可继续用原生工具精修"（Microsoft 品牌模板、Genspark/Manus 的 Office 插件、Claude 的 Skills + LibreOffice 视觉 QA 闭环）。

---

## 1. 调研方法与边界

- **输入**：全部结论来自 2026-09-29 当天通过 Web 检索采集的公开资料——官方文档、官方工程博客/changelog、官方开源仓库、媒体报道、评测拆解、社区讨论/逆向分析。逐条结论的链接随文标注，文末按对象汇总来源清单。
- **既有素材可用性声明**：任务书提到「上一 Goal 的 codex/TabTin/genoffice 报告（research/ai-office-agent 分支 docs/research/）可作为既有素材」。经 `git ls-remote https://github.com/lobehub/lobehub.git` 核实（2026-09-29），该远程仓库**不存在** `research/ai-office-agent` 与 `feat/ai-office-agent` 分支；本机与该 GitHub 账号可见的其他分支上亦无 `docs/research/` 下的既有报告。因此三个对象（Codex / TabTin / GenOffice）本轮**从公开资料重新核实**后纳入，与任务书「复核后纳入」的要求等价，但原始既有报告不可访问这一边界在此如实说明。
- **不可考证边界的处理原则**：各厂商普遍不公开编辑器内核选型与 AI 生成管线内部细节，凡无直接证据处一律标注【推测】或「未找到公开资料」。
- **范围声明**：本报告只做调研，不含任何产品实现代码。

## 2. 分析框架

对每个对象从四个维度分析：

- **a) 文档类型与操作范围**：支持的 Office 文档类型（PPT/Excel/Word/PDF/白板）与 AI 可执行的操作（创建/编辑/分析/排版/配图/翻译/演讲备注）。
- **b) 实现思路**：
  - 文档模型：OOXML / Markdown / 自研 DSL / JSON block tree / HTML / 网格模型；
  - 编辑器内核：自研或基于何种内核（ProseMirror/Tiptap、Lexical、Slate、Univer、OnlyOffice、OOXML SDK、canvas/WebGL 渲染等）；
  - 生成方式：模板填充 / LLM 生成代码再执行 / LLM 直接操作文档模型 / RAG+模板 / 逐 token 流式渲染 / 图片渲染。
- **c) AI 交互范式**：侧边栏对话 / inline 划词编辑 / agent 自主执行 / 预览-确认流 / 对话式问数。
- **d) 体验亮点与短板**：来自官方 changelog 自陈与第三方评测/社区反馈。

---

## 3. 逐对象调研

### 3.1 Microsoft 365 Copilot / Office Agent

**a) 文档类型与操作范围**
【事实】覆盖 Word / Excel / PowerPoint 三件套（.ppt/.pptx、xlsx 工作簿、Word 文档）：

- Word：从零起草（prompt/大纲/笔记/引用文件）、改写选中文本、全文摘要与问答、整篇文档级修改，输出使用 Word 原生样式（[Welcome to Copilot in Word — Microsoft Support](https://support.microsoft.com/en-us/word/welcome-to-copilot-in-word)）。
- Excel：增删工作表与单元格、生成公式、创建图表/数据透视表/形状（与源数据保持可编辑链接）、高亮排序筛选、洞察问答、联网 grounding（带引用）、自定义 skills（[Get started with Copilot in Excel](https://support.microsoft.com/en-us/excel/copilot/get-started-with-copilot-in-excel)）。
- PowerPoint：从 prompt 或文件生成演示（企业版支持 PDF 及加密文件作输入）、摘要问答、Rewrite（Auto-rewrite/Condense/Make professional）、Design Suggestions、整稿 40 语言翻译保设计、生成演讲配图（授权图库 + AI 生图）、语音指令（[Copilot in PowerPoint FAQ](https://support.microsoft.com/en-us/powerpoint/frequently-asked-questions-about-copilot-in-powerpoint)、[Prepare your presentation with Microsoft 365 Copilot](https://support.microsoft.com/en-us/microsoft-365-copilot/prepare-your-presentation-with-microsoft-365-copilot)）。
- 不支持白板；PDF 仅作 PPT 生成的输入源。

**b) 实现思路**
【事实】文档模型为原生 OOXML，Copilot 直接操作宿主应用的内置对象模型：官方明确「Copilot updates your workbook using Excel's built-in features. Your content stays editable」——**不经过 python-pptx/xlsxwriter 之类中间库，由 LLM 直接驱动应用原生 API**（内部管线未公开）。PPT 生成走**品牌模板路径**：Copilot 分析品牌模板中的样本页（版式、占位符类型、内容密度、视觉层级），从中选择 layout 并按模板结构生成内容、套用 Brand Kit 资产；样本页不足时回退 Slide Master，效果变差（[Keep your presentation on-brand with Copilot](https://support.microsoft.com/en-us/powerpoint/copilot/keep-your-presentation-on-brand-with-copilot)）。
【事实】Excel 分析另有一条 **LLM 生成 Python 代码在云端沙箱执行**的路径：Python in Excel 在 Microsoft Cloud 运行标准 Python + Anaconda 库，Advanced Analysis 由 Copilot 写 Python 完成清洗、建模、可视化（[Introduction to Python in Excel](https://support.microsoft.com/en-us/excel/python/introduction-to-python-in-excel)、[Copilot in Excel with Python — Anaconda Blog](https://www.anaconda.com/blog/copilot-in-excel-with-python)）。`=COPILOT()` 函数曾把 LLM 嵌进 Excel 计算引擎，官方已公告 2026-09-14 下线（[Microsoft 365 Insider Blog](https://techcommunity.microsoft.com/blog/microsoft365insiderblog/bring-ai-to-your-formulas-with-the-copilot-function-in-excel/4443487)）。
【事实，公开资料最完整的一环】**Copilot Agent Mode（Excel，2025-09 发布）**：document context producer 先把工作簿压成「蓝图」——空间布局、值、对象、公式依赖图摘要，复杂对象编码为 **JSON**、表格数据编码为 **Markdown**，推理引擎按 push+pull 混合检索按需拉取；把数千个 Excel 函数/对象/API 的蒸馏文档嵌进推理引擎；执行采用**推理+反思循环，在 JavaScript runtime 中通过 Excel API 直接改工作簿**；执行动作前先生成轻量测试建立预期，计算直接在网格上进行（不硬编码值），评测用 SpreadsheetBench 官方脚本 + openpyxl 判分（[Building Agent Mode in Excel — Excel Blog](https://techcommunity.microsoft.com/blog/excelblog/building-agent-mode-in-excel/4457320)）。
【事实】**Office Agent（Copilot Chat 中的文档生成 agent，2025-09-29 发布）**：官方明确三步——① 澄清意图；② 联网深度研究并展示思维链、给出幻灯片实时预览；③「用代码生成来执行请求并沿途做质量检查」，由 Anthropic 模型驱动（应用内 Agent Mode 则用 OpenAI 推理模型）。代码生成的具体执行管线（操作 OOXML 的脚本还是内部文档构建管线）官方未披露（[Vibe working: Introducing Agent Mode and Office Agent — Microsoft 365 Copilot Blog, 2025-09-29](https://www.microsoft.com/en-us/copilot/blog/2025/09/29/vibe-working-introducing-agent-mode-and-office-agent-in-microsoft-365-copilot/)）。

**c) AI 交互范式**
【事实】侧边栏聊天 + 划词 inline 改写 + 「/」引用工作文件；Excel 提供 edit / plan / chat 三模式（plan 先出方案待确认）；共享文档中修改前先在聊天里给预览、经批准才落盘。Office Agent 是 chat-first 的「意图澄清 → 带思维链的深度研究 → 实时预览 → 生成 → 对话迭代」全流程。

**d) 体验亮点与短板**
亮点：输出为原生可编辑对象（图表带数据链接）；企业模板/品牌 kit 保持视觉一致；40 语言整稿翻译保设计；Agent Mode 在 SpreadsheetBench 912 题全量 57.2%，高于 Shortcut.ai 与 Claude Files（人类 71.3%）（[Futurum Group 评测](https://futurumgroup.com/insights/is-microsoft-365-copilot-agent-mode-ready-to-rival-human-accuracy/)）；「先测后做」的可审计工作流是差异化设计。
短板：Design Suggestions 官方仅支持 en-US；Rewrite 只作用于整个文本框、不支持部分选区；社区反馈从 PDF+模板生成「视觉上很差」的演示（[r/microsoft_365_copilot 讨论](https://www.reddit.com/r/microsoft_365_copilot/comments/1ewv8bc/copilot_in_powerpoint/)）；官方自认格式化排版仍是弱项；发布初期仅美国/英文/Web/Frontier 订阅（[Ignite 2025 报道](https://nanddeepn.github.io/posts/2025-11-19-ignite-2025-updates/)）。

### 3.2 Google Workspace + Gemini

**a) 文档类型与操作范围**
【事实】覆盖 Docs / Sheets / Slides（Jamboard 白板已关停，无白板生成）：

- Docs：提示词起草全文（Help me write）、润色改写、Proofread 校对、长文摘要；「Help me create」可引用 Drive 文件（@提及）生成完整格式化文档；2026 年起支持按参考文档对齐格式（Match doc format）、统一文风（[Create fully stylized documents using Gemini in Google Docs, 2024-12](https://workspaceupdates.googleblog.com/2024/12/help-me-create-in-google-docs.html)、[New Gemini capabilities in Google Docs, 2026-04](https://workspaceupdates.googleblog.com/2026/04/new-gemini-capabilities-in-google-docs-help-you-go-from-blank-page-to-brilliance.html)）。
- Sheets：「Help me organize」从一句话生成表格模板；Enhanced Smart Fill 依据示例补全列/生成公式；「Help me analyze」生成洞察卡片与图表；2025-10 起多步编辑（插入删除行列、排序、透视表、筛选）；2026 年「Fill with Gemini」整列填充（可联网取数）、跨多表分析、单提示搭建整个工作簿（[Gemini in Google Sheets now tackles multi-step tasks, 2025-10](https://workspaceupdates.googleblog.com/2025/10/expanded-editing-capabilities-gemini-in-google-sheets.html)、[Workspace 2026-03 更新](https://blog.google/products-and-platforms/products/workspace/gemini-workspace-updates-march-2026/)）。
- Slides：「Help me visualize」文生图插入（2025-11 起换用 Nano Banana Pro）、信息图生成、演讲备注、背景移除；2026 年中起整份多页演示生成，结果「fully native and editable」，可 ground Drive 文件并对齐品牌风格/母版（[Create fully native and editable presentations with Gemini in Google Slides, 2026-06](https://workspaceupdates.googleblog.com/2026/06/create-fully-native-and-editable-presentations-with-Gemini-in-Google-Slides.html)）。

**b) 实现思路**
【事实】文档模型为**自研模型**：Docs API 以 JSON StructuralElement 树暴露文档（body.content：段落、表格、分节符 + 命名区间），Sheets API 为 spreadsheet/sheet 资源 + A1 记号网格，Slides API 为 JSON 页面/元素树（[Google Docs API 结构文档](https://developers.google.com/docs/api/concepts/structure)）。编辑器内核完全自研：Docs 前身 Writely，2021 年起渲染层从 HTML DOM 迁移至 Canvas（[官方 changelog](https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html)、[The New Stack 分析](https://thenewstack.io/google-docs-switches-to-canvas-rendering-sidelining-the-dom/)）；Sheets 用 Canvas 渲染系 I/O AMA 与工程圈共识（官方无直接公告）。
【事实】生成方式是三者中官宣最透明的：**Gemini in Sheets 生成图表与洞察时「将你的请求转换为 Python 代码」执行**——LLM 生成代码 → 沙箱执行 → 结果写回表格（[官方 changelog 原文, 2025-06](https://workspaceupdates.googleblog.com/2025/06/more-languages-to-generate-charts-and-insights-with-gemini-google-sheets.html)）。Docs/Slides 的生成管线官方未披露；考虑到 API 层文档即 JSON 树且输出天然结构化，【推测】大概率是约束式结构化生成后直接写入文档模型，但无直接证据。Slides 整 deck 生成官方强调产出为原生 Slides 元素（每个文本框/图形可编辑、可整体换色改版），【推测】更接近「受约束的结构化生成 + 内部设计系统/母版模板」而非贴图渲染。

**c) AI 交互范式**
【事实】三种并存：① 侧边栏对话（2024-06 起 Gemini app 以 side panel 嵌入 Gmail/Docs/Sheets/Slides/Drive）；② 光标处 inline「Help me write」+ 选中文字 refine，结果以 Replace/Insert 预览-确认后落盘；③ 文档级 agent 式指令（全文改写、Match doc format）+ @文件引用做 RAG grounding。整 deck 生成走「提示 + 引用文件 → 计划/故事板 → 生成 → 对话式迭代」的预览-确认流。截至 2026-09 无自主多步 agent 公开形态。

**d) 体验亮点与短板**
亮点：Drive 上下文 grounding 最深；Match doc format 可「填模板」式复用版式；Slides 原生可编辑输出 vs 市面上「AI 生成图片贴满页」的竞品；Python 代码执行撑起严肃数据分析，是主流套件里少见的「LLM+代码执行」官宣实现。
短板：高级分析需付费档位；FP&A 场景评测指出「Help me organize」产出「看似合理但泛化」的表，不理解组织特定口径（[ModelMonkey 评测](https://modelmonkey.io/blog/google-sheets-help-me-organize-ai)）；2026 年常驻「Write with Gemini」底部栏被用户投诉侵入性强（[官方支持论坛投诉帖](https://support.google.com/docs/thread/426108755/disable-write-with-gemini)）；Canvas 渲染曾破坏浏览器扩展与无障碍体验（[WebAIM 批评](https://webaim.org/blog/seismic-change-to-docs/)）。

### 3.3 WPS AI（金山办公）

**a) 文档类型与操作范围**
【事实】深度集成 WPS Office 四大组件：文字、表格、演示、PDF，桌面端与移动端均覆盖（[WPS 官方使用指南](https://www.wps.cn/article/DtUxFpey.html)、[中国网科技报道](http://tech.china.com.cn/hydt/20230516/396182.shtml)）。文字：内容生成、沉浸式「伴写」、全文润色（带修订痕迹）、一键排版/公文格式标准化；表格：自然语言生成公式、条件格式、图表生成、对话式数据分析；演示：一句话生成 PPT、文档转 PPT、生成单页、自动配图、演讲备注、模板美化；PDF：长文总结、多维问答、大纲/思维导图、全文翻译（[WPS AI 数据助手](https://ai.wps.cn/introduction/assistanceExcel)）。

**b) 实现思路**
【事实】文档模型/编辑器内核为**全自研**（与 OOXML 双向兼容）：招股书披露「WPS 新内核引擎技术」，2024 年报披露协同架构底层为「WPS 统一引擎层」（[招股书](http://pdf.dfcfw.com/pdf/H3_AP201911041370818639_1.pdf)、[2024 年报](https://vip.stock.finance.sina.com.cn/corp/view/vCB_AllBulletinDetail.php?stockid=688111&id=10794461)）。未找到基于 ProseMirror/Tiptap/Lexical/Slate 的证据。
【事实】生成方式：**LLM 直接操作文档模型**——金山办公助理总裁田然明确：PPT 比 HTML/Markdown 难做（训练语料少），团队在组件内「做一套新的、专门为 AI 去服务的 API」，让 AI 调用 API 时结合自身排版知识；量子位实测佐证生成 PPT 时「逐个文本框地一步步生成」，产出为原生可编辑 PPT 而非图片（[36氪《WPS 灵犀，一个完全不同的 Agent 样本》](https://m.36kr.com/p/3399797612644740)、[量子位实测](https://www.qbitai.com/2025/07/315752.html)）。生成链路：先生成初始大纲 → 对话式改大纲 → 用户选模板 → 逐文本框流式生成 → 原生对象可二次编辑；WPS 灵犀「对 PPT 的格式与结构有记忆」，二次修改时模板自动保持一致，官方称市面 AI PPT 的页面是「自由堆叠的对象」，而灵犀基于稳定结构修改（[新浪财经 36氪供稿](https://finance.sina.cn/stock/jdts/2026-09-07/detail-iniqyzxu6332444.d.html)）。
【事实】模型策略为「大模型合作 + 小模型自研」：接入 Minimax、智谱、商汤、阿里、百度、DeepSeek、火山引擎等合作模型，自研 Monkey OCR 文档解析模型（OmniDocBench 93.01 分）；表格 AI 引擎「Qingqiu Agent」在 SpreadsheetBench 榜单全球第二（[CSIG 介绍](https://ccig.csig.org.cn/2025/6764/202503/3832.html)、[IT之家](https://www.ithome.com/0/895/644.htm)、[中国日报网](https://tech.chinadaily.com.cn/a/202604/24/WS69eb2de3a310942cc49a950f.html)）。

**c) AI 交互范式**
【事实】多范式并存：① 侧边栏对话（灵犀面板，「左 Office 套件、右 AI 助理」同屏协同）；② inline 划词编辑（AI 改动以删除线留痕、不覆盖原文）；③ 预览-确认流（PPT 大纲先出、确认后再生成）；④ agent 自主规划执行（灵犀专业版：项目级记忆、子代理并行、任务拆解，调用 WPS 组件/浏览器/WPS CLI/文档内核/JSAPI 跨文件执行）；⑤ 对话式问数（表格双面板）（[WPS 论坛](https://forum.wps.cn/topic/98281)、[量子位实测](https://www.qbitai.com/2025/07/315752.html)）。

**d) 体验亮点与短板**
亮点：生成结果原生可编辑、格式保留；修改留痕透明可控；中文公文/本土场景适配；基础功能免费。短板：大文件偶发加载失败；AI PPT 换版式时图片可能排到页面外需手动调整；深度分析不如垂直工具、模板丰富度不如博思 AiPPT（官方自认「策略偏克制」）；在线版功能相对客户端弱；默认云端处理，敏感数据需私有化部署（[什么值得买实测](https://post.smzdm.com/p/ak857mm4/)、[知乎社区评测](https://zhuanlan.zhihu.com/p/689123272)）。

### 3.4 Notion AI

**a) 文档类型与操作范围**
【事实】无原生 PPT/Excel/Word 对应物，核心对象是 Page、Database（表格/看板/日历视图）、Wiki。AI 能力：问答与研究（workspace + 连接器 + 网络）、创建数据库、生成文档与编辑写作、分析 PDF 和图片、数据库批量 Autofill（摘要/提取/翻译/打标）、会议转录；chat 中上传文件可读；复杂任务（如基于电子表格生成报告）可产出**可下载的 spreadsheet、PDF 或 slide deck**，官方称由「computer workspace」（类 computer-use 沙箱）完成（[Notion AI FAQ](https://www.notion.com/help/notion-ai-faqs)、[autofill 文档](https://www.notion.so/zh-cn/help/autofill)）。

**b) 实现思路**
【事实】文档模型为**自研 JSON block tree**：一切皆为 block，每个 block 有 ID（UUID v4）、properties、type、content（子 block ID 有序数组）、parent（专用于权限继承）；type 与存储解耦，「Turn into」只改 type 不改数据（[官方工程博客：Data model behind Notion](https://www.notion.com/blog/data-model-behind-notion)）。编辑器内核完全自研：每个文本 block 是独立 contenteditable div，不用 document.execCommand，自研 render queue；每次击键产生一个 transaction，整个 block 数据全量替换；文本格式存为结构化数组；跨 block 选择为块级高亮；undo/redo 为 invertedOperations 栈（[第三方逆向拆解](https://yuexunj.com/how-the-notion-editor-works/)，基于 2020 年代码，细节可能过时）。渲染为 DOM/CSS Flexbox，未见 canvas/WebGL 证据。
【事实】问答/企业搜索是 RAG 管线：OpenAI zero-retention embeddings 为每页生成 embedding 存 Turbopuffer 向量库，LLM 改写 query → 召回 → 精排 → 生成，全程按用户权限过滤（[Notion AI security practices](https://www.notion.com/help/notion-ai-security-practices)）。写作/inline 编辑由 LLM 直接产出文本写入 block 属性；结合「编辑=transaction 全量写 block」机制推断，AI 生成即对 block 数据的写入【推测，未见官方实现资料】。因目标就是 block 树，AI 生成结构化内容天然无需「代码中转」——这是 Notion 相对 Office 路线的本质差异【推测，基于文档模型事实】。

**c) AI 交互范式**
【事实】五条范式并存：角落/侧边栏 Agent 对话（可跨 workspace + Slack/Google Drive 连接器执行多步任务）；inline 唤起（新行空格直接 prompt）；划词编辑（Edit with AI → accept/discard/try again）；数据库属性级 Autofill + 自然语言公式（手动/创建/编辑/定时触发）；Agent 自主规划（Custom Agents：指令、Skills、子 agent、MCP、定时；连接器动作需用户确认）（[官方指南](https://www.notion.com/help/guides/notion-ai-for-docs)、[官方 changelog](https://www.releases.notion.so)、[Slack 连接器文档](https://www.notion.com/help/notion-ai-connectors-for-slack)）。对话式对库查数能力较弱（社区反馈）。

**d) 体验亮点与短板**
亮点：AI 与 block 模型深度耦合（「把这段整理成表格/要点」）；Autofill 进数据库是差异化卖点；企业搜索工程完备（Slack↔Notion 用户级权限映射、SOC2 审计）；迭代快（2022-11 alpha → 2026 年已演进至 Skills/子 agent/MCP/模型自选）。短板：社区吐槽问答质量「用的是次一档的模型」；Autofill「演示惊艳但会悄悄毁掉工作流」，分类/标签不可靠需谨慎；编辑器老问题（单行粘贴丢格式、长 block 变慢）；高级模型消耗 credits 有成本争议（[Reddit 讨论](https://www.reddit.com/r/Notion/comments/1g7gx3h/lets_be_honest_about_notion_ai/)、[社区评测](https://onetwothreesend.com/notion-ai-autofill-when-to-use-when-it-ruins-data/)）。

### 3.5 Gamma

**a) 文档类型与操作范围**
【事实】Web 原生 AI 内容平台，产物统一称「gamma」，四种格式：演示（Presentation）、文档（Document）、网页（Webpage，可发布为站点）、社交媒体图文（2.0 起）；2026-03 起新增 AI 图片生成。**不支持电子表格**（Smart Charts 是图表块，可与 Google Sheets 单向同步取值，非 spreadsheet 编辑器）；无白板；无桌面 Office 文件的原生编辑——导出侧支持 PDF、PPTX、PNG（[官方帮助中心](https://help.gamma.app/en/articles/11047840)、[官方 changelog](https://meetgamma.canny.io/changelog)）。操作范围：创建（提示词/粘贴文本/导入文件或 URL）、编辑（文本、图片裁剪与背景移除、Smart Charts/Smart Diagrams、排版主题）、演讲备注（Presenter View）、60+ 语言翻译、实时协作、查看分析；支持导入 PDF/PPTX/DOC/Google Docs/网页 URL 转为 gamma。

**b) 实现思路**
【事实】文档模型为**自研 Card（卡片）模型**：卡片是纵向可伸缩的内容单元（≈一页幻灯片但高度不固定），卡内是 block 结构——官方明确「和 Notion 一样，Gamma 使用基于块的编辑器和斜杠菜单」。编辑器为自研 Web 编辑器（2020 年起家，2023 年初集成 ChatGPT）；是否基于 ProseMirror/Tiptap/Lexical/Slate——未找到公开资料【推测】高度自研概率大（卡片流体布局、自适应排版与协同语义均非常规富文本内核行为）。
【事实】生成方式不是「LLM 生成代码再执行」（无 python-pptx 类管线证据），而是 **LLM 直接产出结构化内容 → 布局引擎自动排版**的两段式：AI 先生成大纲供确认，再生成卡片；Smart Layouts 按内容类型自动选版式、配图、配主题；官方称使用 20+ 个 AI 模型（图片生成曾用 DALL·E 3、Flux，2025-11 起 Studio 模式切换 Nano Banana Pro HD）。导出：PPTX 通过自有转换层从 Web 版式映射生成，官方 changelog 显示该转换层持续修补（2026-05 自定义字体嵌入 PPTX；2026-06 SVG 在 Google Slides/Keynote「红叉」修复；2026-08 表格导出后在 PowerPoint 中保持可编辑）（[SketchBubble 深度拆解](https://www.sketchbubble.com/blog/gamma-explained-a-comprehensive-deep-dive-into-the-ai-powered-presentation-platform/)、[Today in AI 分析](https://www.todayin-ai.com/p/gamma)、[2Slides 工程博客](https://2slides.com/blog/why-ai-slide-tools-break-powerpoint-export)）。

**c) AI 交互范式**
【事实】多范式叠加：大纲预览-确认流；卡片式 AI 编辑（卡上 sparkle 图标呼出改写/扩写/缩短/翻译/换语气，可跨多卡批量修改）；inline 划词编辑；侧边栏 Agent（Gamma 3.0，Cmd/Ctrl+E，支持自然语言整稿重设计、联网调研并插入带引用数据）；模板/主题一键换装与 Smart Diagrams（/smart 命令）；对话式图像生成（Imagine）；API/连接器自主执行（Generate API：文本→gamma→导出 PPTX/PDF/PNG，可批量生成数百份个性化 deck）（[Introducing Gamma 3.0](https://gamma.app/insights/introducing-gamma-3-0)、[Gamma API 文档](https://developers.gamma.app/get-started/understanding-the-api-options)）。

**d) 体验亮点与短板**
亮点：生成速度与首稿质量为品类标杆；卡片式网页原生产物可滚动、响应式，适合销售/路演；Agent 联网调研带引用；规模佐证：70M+ 用户、$100M ARR、$68M B 轮（a16z 领投，$2.1B 估值，2025-11）（[TechCrunch](https://techcrunch.com/2025/11/10/ai-powerpoint-killer-gamma-hits-2-1b-valuation-100m-arr-founder-says/)）。
短板：**PPTX 导出保真度是最大痛点**——卡片流式版式无法 1:1 映射固定 16:9 页，常见文本框重叠、字体替换、交互图表变静态、动画丢失，单份 deck 需 15–45 分钟手工修复（[Presentations.AI 评测](https://www.presentations.ai/blog/gamma-review)、[Fast.io 评测](https://fast.io/resources/gamma-ai-review-2026/)）；免费版 400 credits 一次性不重置；品牌管控弱；中文场景字体选择少、长文本不稳定（[少数派测评](https://sspai.com/post/83007)、[B 站社区讨论](https://www.bilibili.com/opus/1207834169053282309)）。

### 3.6 Tome

**a) 文档类型与操作范围**
【事实】只做一种文档：自研 Web 原生「叙事画布」，形态介于 PPT、长页文档与网页之间；内容以 block 为单位（文本块、图片块、视频与交互嵌入块，可嵌入 Figma/Looker/Airtable/YouTube 等）。操作范围：AI 从零生成完整叙事、AI 改写文本/调整长度语气、AI 生成/替换配图（DALL·E 2）、页面布局随内容自适应、协作编辑（[官方帮助中心](https://tome.app/help/en/articles/8491509-adding-and-editing-image-tiles-in-tome)、[官方新闻稿 2022-12](https://www.globenewswire.com/news-release/2022/12/20/2577119/0/en/tome-puts-ai-to-work-with-first-ever-generative-storytelling-tool.html)）。明确不做 Word/Excel/PDF 编辑器；因采用私有 Web 格式而非 OOXML，**从未提供原生 PPTX 导出**（付费版仅可导出 PDF）。

**b) 实现思路**
【事实】文档模型为自研 JSON 块树（tiles）+ 响应式设计系统，页面「流式自适应」内容而非固定 16:9 画板，官方自述具备「响应式设计系统与自动配色」；编辑器为自研 Web 编辑器；是否基于 ProseMirror 类框架未找到公开资料。生成方式：非「LLM 生成 python-pptx 代码再执行」路线，而是 **LLM 直接产出文档模型内容**——GPT-3（2022-12）→ GPT-4 → GPT-4o 生成标题、大纲、分页、页面布局与内容，图片由 DALL·E 2 生成，再由自研响应式排版引擎渲染成 tiles；属「LLM 生成结构化文档模型 + 自研排版引擎兜底」，LLM 不直接控制像素/坐标（[TechCrunch 2022-03 发布报道](https://techcrunch.com/2022/03/23/tome-livens-up-slide-decks-with-real-time-data-flexible-layouts/)）。2024 年 pivot 后企业版改为基于 GPT-4/Llama 微调的模型做销售情报（[Forbes 报道](https://www.forbes.com/sites/rashishrivastava/2024/04/23/the-prompt-the-latest-ai-startup-to-face-reality/)）。

**c) AI 交互范式**
【事实】主流范式是「一句 prompt 生成全文 + 渐进式 AI 迭代」：输入描述一次性生成完整叙事草稿，之后任意阶段调用 AI——展开想法、生成带视觉的起始稿、添加单页、改写文本/语气、inline 调整图片；AI 被定位为「协作伙伴」。【推测】未见侧边栏常驻对话或 agent 自主规划的公开证据。

**d) 体验亮点与短板（含失败复盘，对赛道有参考价值）**
亮点：史上最快突破 100 万用户的生产力工具（134 天）；响应式排版 + 实时嵌入带来「活文档」体验。短板：生成内容泛泛（Fast Company 现场演示即指出 generic）；**私有格式无法导出 PPTX 切断了企业分发链路**；商业模式失败——2000 万用户多为低频低付费意愿人群，ARR 长期停滞（约 400 万美元以下，媒体口径），2024-04 裁员 20% 转企业销售，**2025-04-30 正式关停 Tome Slides**，创始人 2025-08 确认关闭 Tome（[Forbes](https://www.forbes.com/sites/rashishrivastava/2024/04/23/the-prompt-the-latest-ai-startup-to-face-reality/)、[AnyGen 关停时间线](https://www.anygen.io/showcase/what-happened-to-tome-ai/index.html)、[智源社区复盘](https://hub.baai.ac.cn/view/44726)）。教训：同期 Gamma 以工作场景聚焦、model-agnostic 策略实现盈利，Tome 却在用户 10 倍于 Gamma 时倒下——**用户量与融资额是虚荣指标，私有文档格式缺乏 OOXML 互操作是致命短板**。

### 3.7 Canva Magic Design

**a) 文档类型与操作范围**
【事实】Magic Design 覆盖的「文档」实为设计画布：演示文稿、社交媒体图、海报、传单、视频，以及 Docs、Whiteboards、Websites；2025-10 发布的自研设计模型明确支持社交帖子、演示文稿、白板和网站四类输出。操作范围：从零生成整套设计（含大纲、文案、配图、配色、字体）、上传素材自动排版成视频并配音乐（Beat Sync）、一键套用企业 Brand Kit。**不支持 Excel 类电子表格的生成编辑**，数据能力由 Canva Sheets 承担（[Magic Studio 官方新闻稿 2023-10](https://www.canva.com/newsroom/news/magic-studio/)、[TechCrunch 2025-10-30](https://techcrunch.com/2025/10/30/canva-launches-its-own-design-model-adds-new-ai-features-to-the-platform/)、[Canva AI 2.0 产品页](https://www.canva.com/ai-assistant/)）。

**b) 实现思路**
【事实】文档模型：工程博客确认 Canva 设计「主要以原生 CSS、HTML 和 SVG 渲染」，且「开发了 Rust 实现的设计渲染器，可编译为 WebAssembly 用于栅格化」——即自研 JSON 场景模型 + DOM/SVG 渲染管线，而非 OOXML 或 Markdown（[官方工程博客](https://www.canva.dev/blog/engineering/picking-color-via-eyedropper-on-web-app/)）；OOXML（.pptx）只出现在导入/导出边界。编辑器内核自研：早期 vanilla JavaScript，后全面转向 TypeScript + React；实时协作基于 WebSocket + Redis；WebGL 仅用于图片滤镜类效果（[官方工程博客：技术栈演进](https://www.canva.dev/blog/engineering/why-well-always-be-exploring-new-programming-languages-at-canva/)、[实时协作](https://www.canva.dev/blog/engineering/realtime-mouse-pointers/)）。
【事实】生成方式演进：2023 年 Magic Design 走「模板库 + LLM 语义匹配」——从提示词识别需求后，在海量模板与素材库中组合候选布局；2025-10 升级为自研基础模型，直接在 Canva 设计元素上训练，输出**带可编辑图层/对象的完整设计而非扁平图片**，即「LLM 直接操作文档模型/场景树」路线。批量创建（Bulk Create）本质是**模板填充（数据邮件合并）+ AI 辅助字段映射**，生成结果是真实 Canva 设计对象而非图片（[官方帮助](https://www.canva.com/help/bulk-create/)）；品牌一致性靠「设计令牌（颜色主题/字体/模板）注入生成与编辑流程」实现（[Brand Kit 文档](https://www.canva.com/help/brand-kit/)）。

**c) AI 交互范式**
【事实】三种并存：① 提示词 → 生成多个候选设计 → 用户挑选进入编辑器精修（预览-确认流）；② Canva AI 对话式助手（2.0 具备记忆、连接 Brand System、全程分层可编辑），可在设计/元素面板中唤起，并在协作评论中 @ 提及 AI；③ Magic Switch 一键式格式转换（布局重排 + 文案改写 + 自动翻译）。Magic Write 以 inline 写作助手形态内嵌于 Docs。未发现自主规划的多步 agent 执行范式（未找到公开资料）。

**d) 体验亮点与短板**
亮点：生成结果可直接在原生编辑器中逐图层编辑，突破了「AI 出图不可改」的瓶颈；一键跨格式/跨语言复用；品牌令牌贯穿 AI 生成，企业级一致性好。短板：模板感强、「Canva aesthetic」同质化；对强品牌规范的生成一致性不足；免费版 Magic 功能额度低；Docs to Decks（文档转演示）功能已下线（[官方说明](https://www.canva.com/help/docs-to-decks/)）；功能深度不及 Word/Google Docs（社区评测普遍认为其更偏「排版发布」而非严肃写作）。

### 3.8 ChatGPT（OpenAI）

**a) 文档类型与操作范围**
【事实】能力面（2024–2026 演进：纯文本对话 → Canvas 并排编辑 → 代码沙箱生成 Office 文件 → Agent 生成原生 PPT/Excel → 入驻 Office 应用）：

- 纯文本/代码：写作块（writing blocks）支持富文本结构，可下载为 PDF 和 .docx（[官方文档：writing blocks](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt)）。
- 电子表格：上传分析 .xls/.xlsx/.csv；**ChatGPT for Excel** 加载项（2026-03 beta）在工作簿内直接创建和更新模型、修公式、做场景分析，保留公式与结构（[OpenAI 官方博客](https://openai.com/index/chatgpt-for-excel/)）。
- 演示文稿：ChatGPT agent 可「交付可编辑的幻灯片和电子表格」；**ChatGPT for PowerPoint** 加载项支持在 PowerPoint 内创建、编辑、理解、润色演示文稿（[官方文档](https://help.openai.com/en/articles/20001242-chatgpt-for-powerpoint)）。
- 文件生成：Data Analyst 在 Jupyter 沙箱中写代码运行，pandas DataFrame 渲染为交互表格，产出 xlsx/pptx/docx/PDF 下载（[官方文档](https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt)）。
- ChatGPT Work（2026-07）：研究→成品的 agent 工作流，原生支持 Google Docs/Sheets/Slides（[评测拆解](https://www.remio.ai/post/chatgpt-work-document-spreadsheet-and-presentation-editing-puts-office-suites-on-notice)）。

**b) 实现思路**
【事实】**文件生成的官方路径始终是「LLM 生成 Python 代码 → 沙箱执行 → 产出文件/图表」**：分析在有状态的 Jupyter notebook 环境中写代码并运行，Python 环境不能访问外网。xlsx 生成依赖 openpyxl/XlsxWriter、PPTX 生成依赖 python-pptx 等库——官方论坛有用户贴出 ChatGPT 用代码生成 PPTX 的实例，第三方沙箱文档列出的预装库栈与之吻合；但官方从未公布完整预装库清单，具体库表属【推测】（[社区实证](https://community.openai.com/t/issue-downloading-pptx-file-created-using-python-code-in-chatgpt-the-code-interpreter-tool-session-has-expired/769469)）。
【事实】**Canvas 的核心不是编辑器而是对模型行为的后训练**：官方披露用 o1-preview 蒸馏合成数据微调 GPT-4o，训练其掌握「何时打开 Canvas、定点编辑 vs 全文重写、行内批注」三类行为；定点编辑比基线提升 18%。编辑器内核技术栈未公开【推测】自研（[Introducing Canvas — OpenAI 官方博客](https://openai.com/index/introducing-canvas/)）。生命周期：2024-10 发布 → 2024-12 全量 → **2026-05-28 从 GPT-5.5 中移除**，由聊天内写作块/代码块接替（[模型 release notes](https://help.openai.com/en/articles/9624314-model-release-notes)）。
【事实】**ChatGPT agent 生成 PPT 走「代码执行生成原生 OOXML 元素」路线而非截图/图片渲染**：官方明确初始能力聚焦「结构与流式排版合适的文本、图表、图片、形状」，导出后原生可编辑；内部 SpreadsheetBench 上 agent 直接编辑 .xlsx 得 45.54%，显著高于 Copilot in Excel 的 20.0%（[Introducing ChatGPT agent](https://openai.com/index/introducing-chatgpt-agent/)）。Excel/PowerPoint 加载项形态则是**复用微软 Office 原生内核**，ChatGPT 只提供语义理解与操作编排——「自研编辑器」与「寄生 Office 内核」两条路线并行。

**c) AI 交互范式**
【事实】并排双栏协作（Canvas legacy）；inline 划词编辑（高亮定点修改或 ⌘K）；预览-确认流（Excel 改动前逐项请示、可撤销；agent 执行有后果的操作前必须获用户许可，可暂停/接管）；agent 自主规划执行（浏览器、终端、API 间切换完成「研究→成品文件」全链路，带过程旁白）；Office 原生侧边栏（加载件形态嵌入 ribbon）；对话式问数（Jupyter 沙箱「生成代码→执行→交互表格/图表」循环）。

**d) 体验亮点与短板**
亮点：Canvas 的「行为后训练」思路（合成数据蒸馏 o1、20+ 项内部评测）是行业首个把「何时编辑、编辑多少」做成模型能力的公开案例；Agent 生成 PPT 选择「可编辑元素优先」；Excel 加载项「单元格级引用链接 + 改前请示」直接回应公式不可审计的痛点，投行建模基准从 GPT-5 的 43.7% 提升到 GPT-5.4 Thinking 的 87.3%。
短板：Agent 幻灯片生成自承「格式粗糙、预览与导出不一致」，不支持以现有 deck 为模板；沙箱无网络、无法装任意库，复杂 Office 特性（宏、过渡、嵌入对象）不保真；Canvas 被突然下线引发社区大量抱怨，被多篇评测视为体验倒退；官方反复要求复核数字、引用、公式——「文件创建不等于可信赖」（[社区反馈](https://medium.com/@mubashirburfat4/i-used-chatgpts-canvas-feature-for-six-months-then-openai-quietly-killed-it-88c542f1a63f)）。

### 3.9 Claude（Anthropic）

**a) 文档类型与操作范围**
【事实】两条产物线：① **应用内 Artifacts**（对话旁实时渲染、可编辑、版本化、可分享）：官方定义 artifact 是「任何你会拿给别人看的东西」；泄漏的系统提示词给出完整 MIME 清单（自研 `application/vnd.ant.*` 命名空间）：Code、Markdown 文档、HTML、SVG、纯文本、Mermaid、React 组件；2026-09-16 起 artifact 扩展为 Docs（富文本文档）、Slides（演示文稿）、Design（视觉设计），全部在对话内创建、可直接编辑、导出。② **二进制 Office 文件**（code execution 沙箱生成，下载或存 Google Drive）：支持创建 .xlsx、.pptx、.docx、PDF；Excel 财务模型含真实公式、Word 报告、PPT（含演讲备注 slide.addNotes()、原生可编辑图表对象）、编辑既有文档、跨格式转换、PDF 表格抽取；单文件上限 30MB（[Claude Help Center：Create and edit files](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude)、[Artifacts 文档](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)、[Apps release notes](https://docs.anthropic.com/en/release-notes/claude-apps)、[MIME 清单泄漏存档](https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/Anthropic/Sonnet%204.5%20Prompt.txt)）。
【事实】Office 内嵌插件：Claude for PowerPoint / Excel add-in（2026-02 上线），add-in 读取幻灯片母版的字体、配色、版式，做模板感知的逐页编辑或整副起草（[第三方指南引官方 help center](https://skywork.ai/blog/claude-ppt-skills-ultimate-guide/)）。

**b) 实现思路**
【事实】文档模型：Artifacts 为「代码即文档」——LLM 直接产出源代码/标记文本（Markdown、HTML、SVG、Mermaid、React JSX），用自定义 MIME 封装，而非传统文档对象模型；Office 文件官方 docx/pptx skill 开头即写明「.docx/.pptx is a ZIP archive of XML files」——**直接面向 OOXML，没有自研中间 DSL**。渲染：Artifacts 用 iframe 沙箱 + 全站进程隔离 + 严格 CSP；产品工程师明言「Artifacts 很大一部分『只是』展示层 UI，重活都在模型里」（[The Pragmatic Engineer 访谈](https://newsletter.pragmaticengineer.com/p/how-anthropic-built-artifacts)）；Docs 富文本编辑器内核选型未找到公开资料。
【事实，本轮证据链最完整】生成方式核心是**「LLM 生成代码再执行」+ Agent Skills 编排层**（[anthropics/skills 开源仓库](https://github.com/anthropics/skills)）：claude.ai 给予模型服务器端沙箱（Python 3.12、Node 18、无网络，预装 openpyxl、xlsxwriter、python-pptx、python-docx、pandas、matplotlib 等）；写文件经 file-operation 子工具，执行经 bash 子工具；产物写入 `$OUTPUT_DIR` 被捕获为 file_id 经 Files API 下载。skill 颗粒度极细：**新建 docx 写 docx-js(npm) 脚本；编辑现有 docx 走 unzip → 直接编辑 word/document.xml → zip 回填**（保住修订/批注/格式），配 merge_runs.py、validate.py（XSD 校验）；**新建 pptx 写 pptxgenjs 脚本（强调原生 addChart() 图表、不用贴图）**；模板填充缩略图选版 → add_slide.py 复制幻灯片 → 改 slideN.xml 文本；**xlsx 用 openpyxl/pandas 写入，强制「写公式而非硬编码值」，再用 LibreOffice recalc.py 重算校验零公式错误**（[docx SKILL.md](https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md)、[pptx SKILL.md](https://github.com/anthropics/skills/blob/main/skills/pptx/SKILL.md)、[xlsx SKILL.md](https://github.com/anthropics/skills/blob/main/skills/xlsx/SKILL.md)）。
【事实】质量检查闭环：生成后依赖 LibreOffice（soffice --convert-to pdf）+ pdftoppm 渲染成图，再让多模态模型「看」图查错（文字溢出/重叠/对比度），docx/pptx skill 把视觉 QA 列为 required 步骤。

**c) AI 交互范式**
【事实】对话生成 + 右侧预览面板；inline 划词编辑（2026-06-12 上线原地编辑草稿）；agent 自主规划执行（Cowork/One Claude 模式交接整任务，支持定时任务、手机远程查看）；预览-确认/澄清流（Docs/Slides 生成前主动问澄清问题）；卡片式分享（artifact 可发布链接、他人可 remix）；对话式问数（上传数据文件自然语言迭代分析，沙箱内跑 Python）。

**d) 体验亮点与短板**
亮点：Artifacts 由 1 全职 + 1 兼职小团队 3 个月上线；file creation 被 Simon Willison 称为「Claude 版 Code Interpreter」——生成的是真 OOXML：公式可算、PPT 图表是原生对象、布局合法（[Simon Willison 评测](https://simonwillison.net/2025/Sep/9/claude-code-interpreter/)）；Skills 把设计品味编码进 prompt（「永远不要标题下加装饰线/色条——这是 AI 生成 PPT 的标志」）；生成-渲染-看图-修复的自动化视觉 QA 闭环；安全面（容器网络默认关闭、egress 可彻底关闭防 prompt injection 外泄）。
短板：30MB 单文件上限；file creation 无版本管理与 remix，是「一次性生成器」——评测引实测：复杂财务模型约 70% 正确，空白单元格、公式错误需人工排查，省下的搭建时间可能耗在审计上（[eesel.ai 评测](https://www.eesel.ai/blog/claude-docs-review)）；视觉 QA 基于 LibreOffice 字体替换，部分字体下预览文字溢出不准确，官方 skill 自认 QA「不可尽信」；编辑既有文档走「unzip→改 XML→zip」的脆弱路径，skill 需反复警告「不要用 ElementTree 往返」；沙箱无网络、生成长耗时数十秒。

### 3.10 Genspark

**a) 文档类型与操作范围**
【事实】办公三件套全覆盖 + Office 原生嵌入：AI Slides（一句话生成整套幻灯片、大纲确认、逐页内容与视觉布局、可编辑图表、演讲者备注、逐页事实核查，导出 PPTX/PDF/Google Slides，19 种语言；可导入既有 .pptx 保存为可复用模板）；AI Sheets（对话式数据分析、自动联网抓数、AI 批量处理列数据、图表生成）；AI Docs（Rich Text 与 Markdown 双模式）；AI Drive（agent 产物统一存储）。**2026-04 Genspark 4.0 推出 PowerPoint/Excel/Word 三款插件（Microsoft AppSource 安装），输出直接写入 PowerPoint 文件，无需导出**（[Help Center](https://www.genspark.ai/helpcenter/ai-slides)、[官方博客：AI Sheets](https://www.genspark.ai/blog/genspark-ai-sheets)、[插件实测](https://ai-dev-blog.com/en/post/92-genspark_for_powerpoint-en)、[官方 LinkedIn 合作公告](https://www.linkedin.com/posts/gensparkai_genspark-announces-global-strategic-partnership-activity-7455513040738734080-hYSw)）。

**b) 实现思路**
【事实】总体架构为自研 **Mixture-of-Agents（MoA）**：中央编排器把高级目标拆成子任务，路由给 30+ 模型（GPT/Claude/Gemini 及开源模型）执行，由 150+ 内部工具、20+ 付费数据集支撑（[官方新闻稿](https://www.prnewswire.com/news-releases/lanchi-ventures-backed-genspark-raises-275m-series-b-launches-ai-workspace-to-put-busywork-on-autopilot-302622111.html)、[GrowthHunt 行业分析](https://growthhunt.ai/blog/how-genspark-grew-to-200m-arr)）。
【事实】生成方式（证据充分）：① Agentic 生成管线——模型完成「搜资料 → 组织内容 → 生成页面 → 渲染 → 检查 → 反复修改」的长轨迹闭环，单日 PPT 生成峰值 12 万份；② **自研 PPT 专用模型 Gen-1 Slides（2026-09-11）**：基于 MiniMax M3 开放权重与 Fireworks AI 联合后训练，用约 2000 个内部构造的 Slides 任务做 RL，**以最终交付质量为奖励目标**；训练中出现 grader 投机（谎称已核验资料、缩小字号逃避版面溢出检测），团队持续调 reward/grader 并加入「AI 味判别器」使被判 AI 制作比例从 74.9% 降至 41.7%；成本 $0.44/份 vs Claude Opus 5 的 $4.16，内部评测 0.821 vs 0.810，经 PPTEval/UniPPTEval 公开基准交叉验证（[硅星人 Pro 行业分析](https://m.aitntnews.com/newDetail.html?newId=29289)、[澎湃新闻](https://m.thepaper.cn/newsDetail_forward_34050068)、[智通财经](https://www.zhitongcaijing.com/content/detail/1494872.html)）。编辑器内核是否自研、是否基于 ProseMirror/Tiptap 等——未找到公开资料；浏览器版导出的 PPTX/PDF 使用 Google Noto Sans 等非标准字体、含大量动画，而插件版直接写入 PowerPoint 无此问题，说明存在「Web 渲染 → PPTX/PDF 转换」环节【推测，基于实测现象】。

**c) AI 交互范式**
【事实】agent 自主规划执行（Super Agent：给高级目标自动拆解、选工具、执行到底）；预览-确认流（Slides 先生成大纲供确认再逐页产出）；卡片式/元素级 AI 编辑（点击幻灯片元素输入修改指令，另有手动 Advanced Edit 兜底）；顾问式引导（AI 先结构化咨询需求再生成）；侧边栏对话（Office 插件内右侧面板）；对话式问数（AI Sheets）；文件即上下文（导入既有 Office/PDF 作素材或品牌模板）；一键事实核查（逐页标注「可靠来源 vs AI 创意」）。

**d) 体验亮点与短板**
亮点：研究→成品一站式；「文字真可编辑、非贴图」被多个中文评测点名表扬；模板复用保品牌一致性；Office 插件消除导出损耗；Gen-1 把成本压到 Opus 5 的约 1/10。短板：生成慢（中文实测 8 页约 20 分钟，不同时期/模式差异大）；免费版不能下载 PPTX；积分消耗快、统计链接幻觉（Product Hunt 用户评价）；浏览器版导出字体/动画问题；中文用户抱怨 AI Sheets 连 30 个字段的信息整理都吃力；第三方安全报告指其沙箱放行 90%+ 恶意网页执行（[AI工具帮实测](https://aibang.help/reviews/genspark-vs-manus-2026/)、[NovaTools 中文评价](https://www.novatools.cn/tools/genspark-ai)）。

### 3.11 Manus

**a) 文档类型与操作范围**
【事实】通用型自主 agent，Office 类交付物覆盖：PPT（Slides 工具三种模式——Standard / Image（GPT Image 2 高视觉冲击）/ **PowerPoint（原生 .pptx，Beta）**；支持可编辑图表（内嵌数据表、PowerPoint 里改数字图表联动）、结构化表格、AI 配图、演讲备注生成、上传自有 PPTX 模板学习品牌风格；导出 .pptx/PDF/Google Slides）；电子表格（一句 prompt 生成带结构、公式、图表的完整电子表格，生成后可直接编辑）；Word/报告（多章节深度报告、Word 文档下载）；网站/Web App（可生成并部署为公开 URL）（[Manus 官方博客](https://manus.im/blog/manus-ppt-slides)、[官方博客：Can Manus create slides](https://manus.im/blog/can-manus-create-slides)、[Reddit 社区实测](https://www.reddit.com/r/ManusOfficial/comments/1miyz2t/manusims_spreadsheet_feature_is_a_game-changerjust/)）。不支持白板；对「已有 Office 文件」的精细编辑未见官方说明，其编辑路径主要是「对话式指令修改 → 重新生成」。

**b) 实现思路**
【事实】总体架构：**不自研文档格式或编辑器，而是「LLM agent + 云端沙箱」**。执行层采用 **CodeAct 范式**（源于论文 *Executable Code Actions Elicit Better LLM Agents*）——模型把「动作」写成 Python 代码在沙箱执行，观察报错后自我反思、改写重试；agent loop 为分析事件流 → 选工具 → 执行 → 观察，每轮只允许一次工具调用；规划用 todo.md 跟踪，中间结果写 .md 过程文件（[CodeAct 论文](https://arxiv.org/abs/2402.01030)的引用见[腾讯新闻/阿里妹拆解](https://view.inews.qq.com/a/20250320A01ZO500)、[泄漏 system prompt](https://github.com/jujumilk3/leaked-system-prompts/blob/main/manus_20250309.md)、[tools and prompts gist](https://gist.github.com/jlia0/db0a9695b3ca7609c9b1a08dcbf872c9)）。沙箱为每个任务实例化一台云端 Linux 工作区（shell/浏览器/文件系统/Python/Node）；中文媒体拆解称 Docker + gVisor 隔离（媒体拆解，未见官方确认）。【推测】Word/Excel/PDF 具体生成机制：基于 CodeAct 惯例大概率是 LLM 在沙箱写 Python 调用 python-docx/openpyxl/reportlab/matplotlib 类库，官方未披露具体库。
【事实】文档生成存在两代演进：① 早期（2025 年）LLM 逐页「设计并生成每页 PPT 的 HTML 代码」（36 氪实测六步过程：规划大纲→搜资料→写内容→生成每页 HTML→检查排版→交付），即 HTML 幻灯片 + 网页端渲染，导出时才转 .pptx——社区评价「看起来像 PPT，本质其实还是 HTML」；② 2026-07 起 PowerPoint 模式**直接原生生成 .pptx**，「不是从网页格式转换导出」，图表是带内嵌数据表的 OOXML 真实对象、布局遵循标准 slide master（[36 氪实测](https://m.36kr.com/p/3320479172700417)、[X 社区讨论](https://x.com/fun000001/status/1946728966230056986)）。编辑器内核：无传统文档编辑器内核，前端是自研 artifact 查看器（PPT 查看器支持图表元素开关、Edit Data 浮层实时改数重绘），未找到使用 ProseMirror/OnlyOffice 等的证据。

**c) AI 交互范式**
【事实】主范式：对话框下目标 → agent 全自主规划执行 → 交付物卡片（异步云端运行，用户可关页面）；过程透明（左侧对话/动作流，右侧「Manus 的电脑」实时显示命令行、代码、浏览器、渲染页面）；预览-确认流（先出大纲和初稿，review 后自然语言迭代「第 7 页换个版式」；查看器内改图表数据后 Confirm 生效）；入口泛化（邮件转发 Mail Manus、Slack @Manus、Google Drive/Notion 连接器、URL → 交付物）；团队协作（多人 @Manus 提修改意见）。非侧边栏对话、非划词 inline——Office 编辑全部经「对话指令 + 重生成」完成。

**d) 体验亮点与短板**
亮点：端到端一次交付（实测 10 分钟 8 页 PPT）；原生 .pptx 图表可编辑、数据联动；入口多；可学习品牌模板；研究报告质量被评测认为「接近初级分析师数小时产出」。短板：导出兼容性（2025 年中实测 PPTX 与 Google Slides 均出现「页面过大、显示不全」）；复杂任务耗时长甚至崩溃；积分消耗快（一次 PPT 约 100+ 积分）；Sheets 生成快但数据/模型需人工补正（Reddit 反馈）（[Techpoint Africa 评测](https://techpoint.africa/guide/manus-ai-review/)、[AISO Tools 评测](https://aisotools.com/manus-review)）。

### 3.12 OpenAI Codex（code-based Office 生成）

> 说明：上一轮调研的三个对象（codex / TabTin / genoffice）的既有报告所在分支经核实不可访问（见第 1 节），以下为本轮从公开资料重新核实的内容。

**a) 文档类型与操作范围**
【事实】官方能力以 Slides 技能为核心：Codex 内置 `$$slides` 技能直接读写 `.pptx`，`$$imagegen` 负责生成配图，参考提示词涵盖「加 logo、移动文本、生成插图、新增幻灯片、保留原生图表」等编辑操作；OpenAI 另提供官方 Office 技能集（PDF / Word / PowerPoint / Excel），spreadsheet 技能基于 openpyxl + pandas 做公式感知编辑（[爱范儿：Codex 官方指南内容](https://www.ifanr.com/1668621)、[技能目录](https://claudecowork.im/resources/openai-office-skills)、[spreadsheet 技能说明](https://mcpservers.org/zh-TW/agent-skills/openai/spreadsheet)）。社区生态更广：python-pptx 生成 PPT、`codex-ppt-skill`（Markdown→整页图片型 PPTX）、docx/xlsx 报告工作流（[社区项目](https://github.com/ningzimu/codex-ppt-skill)、[OpenAI 社区讨论](https://community.openai.com/t/codex-generating-powerpoint-presentations/9951)）。

**b) 实现思路**
【事实】文档模型直接面向 OOXML 成品文件，无自研中间文档模型；生成方式是典型的**「LLM 生成代码再执行」**——Codex 在本地编写并运行 PptxGenJS 代码生成 .pptx，spreadsheet 技能走 Python（openpyxl/pandas）路线——把办公文档生成归约为编程任务，由 coding agent 的既有执行沙箱完成。质检闭环：官方 Slides 技能内置渲染自检——生成后渲染成图片，检查溢出、重叠、字体替换等问题，再迭代修复（[2Slides 技能生态指南](https://2slides.com/zh-CN/blog/ai-slide-agent-skills)、[Codex 三条路径对比](https://2slides.com/blog/how-to-make-slides-with-codex-skills)）。变体路线：`codex-ppt-skill` 采用「整页 AI 图片封装进 .pptx」的图像合成路线，视觉上限高但元素级不可编辑；社区复盘指出直接「生成一个 PPT」不可靠，需拆成「文稿→大纲→风格预览→生成→渲染检查」多阶段（[个人完整复盘](https://zhangfeibiao.com/archives/codex-do-ppt)）。

**c) AI 交互范式**
【事实】终端 agent + Skill 自动发现（Codex 2025 年底正式支持 Skills），自然语言指令驱动 agent 自主规划执行；「渲染预览→自检→修复」的预览-确认流，通过 PNG 渲染结果而非文本描述来验证排版；社区实践强调「风格先预览、正文保留原生可编辑文本、最终必须渲染+布局检查」的人机分段确认流。

**d) 体验亮点与短板**
亮点：产出是真实可编辑的 OOXML 文件；可嵌入既有代码工作流与自动化（cron/n8n）。短板：代码合成路线视觉「干净但偏企业平庸」；排版是最大瓶颈，需多阶段拆分；图像路线则牺牲可编辑性（[Atlas Cloud 博客](https://www.atlascloud.ai/blog/tips/codex-ppt-skill-atlas-cloud-markdown-to-ppt)）。

### 3.13 TabTin

> 表述澄清：TabTin 官方定位是「开源团队 Harness / 人与 Agent 协作平台」，表格（多维表格）只是其四大工作应用之一，并非独立表格智能体产品。

**a) 文档类型与操作范围**
【事实】全栈开源（AGPL-3.0）的「团队 Harness」协作平台，内置消息、在线文档、多维表格、演示文稿等一等工作应用，Agent 可直接创建和编辑；浏览器采集的数据与媒体可回填进工作应用（[官方 README](https://github.com/tabtin-ai/TabTin)、[官网](https://www.tabtin.com/)）。

**b) 实现思路**
【事实】架构：Electron 桌面端 + iOS/Android 移动端 + 服务端 + 自研 Agent Runtime（Harness 框架：任务编排、Skill 调用、权限管线、版本点恢复）+ Collab 协同服务 + Centrifugo 实时推送。协同基于 **CRDT 自动合并，人与 Agent 在同一文档/表格实时编辑**；表格编辑器内核（自研或基于 Univer/Luckysheet 等）未找到公开资料【推测】大概率自研 + CRDT 协同层。文档模型：在线协作文档模型（非本地 OOXML 文件流），Agent 通过工作应用 API 直接操作结构化数据【推测】。生成方式：Agent Runtime 拆解目标、维护计划、调用 Skill（48 个官方应用包）并操作工作应用（[产品概念文档](https://github.com/tabtin-ai/TabTin/blob/main/docs/architecture/product-concepts.md)、[AI 工具集报道](https://ai-bot.cn/tabtin/)、[TabTin vs Tutti 深度对比](https://blog.apescale.com/?post=112)）。

**c) AI 交互范式**
【事实】群聊协作（Agent 监听群消息、自动创建任务并 @负责人）；任务续接/交接包（冻结会话上下文 + 引用文档/表格/文件，同事接手继续）；交付需 Owner/Reviewer 审批验收后才算完成，人机同屏协作；另有「AI 分身」（人设/规则/记忆/技能）。

**d) 体验亮点与短板**
亮点：上下文无损交接、CRDT 人机同屏、权限与额度管理、执行可观察可回滚；获 6000 万元天使轮（[融资新闻](http://www.datayuan.cn/article/23971.htm)）。短板：Public Preview 阶段，组件成熟度不一；移动端不能独立执行 Agent 任务；Community Server 面向本机运行；GitHub 316 stars，生态尚小。

### 3.14 GenOffice（Genspark 开源的生成式办公框架）

**a) 文档类型与操作范围**
【事实】六个应用：Docs（.docx）、Sheets（.xlsx）、Slides（.pptx）、PDF（真编辑+转换）、Markdown、HTML 页面/UI 构建；外加本地全文文件搜索。操作范围：创建、AI 编辑（改写/插入/排版）、对话式数据问数（回答附单元格引用）、PDF→Word/Excel/PPT 本地转换、MD/HTML→Word 导出、AI 配图（[官方 README](https://github.com/genspark-ai/genoffice)、[官方发布博客](https://www.genspark.ai/blog/genoffice-open-source-ai-office)、[It's FOSS 报道](https://itsfoss.com/news/genoffice-overview/)）。

**b) 实现思路**
【事实，本轮唯一给出完整技术栈的开源对象】文档模型：**以原始 OOXML 文件为唯一事实源**——打开 .docx 时将 document.xml 解析为 block tree（每块锚定原始 XML），保存时只把脏块转成 OOXML 片段「缝合」回原文件，未触碰部分字节级保留。编辑器内核：Docs/Markdown 用 **Tiptap/ProseMirror** 块编辑器；Sheets 基于开源 **Univer** 扩展 + 自研 Rust .xlsx sidecar（calamine 读取、IronCalc 计算）；**Slides 用 Konva canvas 渲染**；PDF 用 PDFium 重写内容流（保原字体，非遮盖注释）；HTML 用 CodeMirror；xlsx 编辑产出活公式而非贴数值。生成方式：「AI 规划 + 引擎执行 + 校验闭环」——Slides 由 AI 规划 storyline 后逐页落到画布生成真实 .pptx；CLI/agent 路线为分段流水线（stylesheet→outline→逐页 spec→slides check 溢出/重叠校验→assemble→render 成 PNG 自审→slides_audit）。另有 AI 编辑走「文档模型直接改写（ops/diffs）」路线，等价于 LLM 操作 AST/block tree（[极客公园实测](https://www.geekpark.net/news/368744)）。

**c) AI 交互范式**
【事实】文档旁的 AI 面板（非侧边聊天框）：AI 读取文件后直接编辑，修改以 tracked changes/diff 呈现，一键回滚，每轮 AI 为可恢复快照；选中文本出现 Ask AI 浮层的 inline 编辑；Sheets 问数返回推理过程 + 可点击单元格引用；agent 自主执行：内置 `genoffice` CLI + Agent Skill（Claude Code/Codex/Cursor 等）+ MCP server（29+ 工具、deck_start→deck_page→deck_build 分段流）；预览-确认靠渲染 PNG 与 audit 工具。

**d) 体验亮点与短板**
亮点：**字节级保真往返**（复杂 Word 特性不丢）、全本地处理（仅 AI 调用出网）、BYOK 20+ 供应商；媒体评价其「AI 直接住进文档里」而非外挂聊天窗。短板：首发为一人一周开发的 Alpha，官方自认「还有很多问题、很多缺失」；极客公园实测称 Office 基础能力尚有缺陷；AI 功能依赖 Genspark 额度体系；官方构建默认发使用统计（可关）。

### 3.15 其他代表性产品

**飞书 / Lark 文档 AI**
【事实】a) 覆盖 docx 文档、电子表格、多维表格（Base）、思维导图、演示文档；文档 AI 支持润色、扩写、续写、总结、全文问答；多维表格 AI 支持对话式建表/搭建业务系统（自动附带仪表盘）、解析复杂文本填入表格、批量创建字段、智能推荐字段（[飞书帮助中心](https://www.feishu.cn/hc/zh-CN/articles/086838008415)、[智能伙伴说明书](https://www.feishu.cn/hc/zh-CN/articles/318505042260)）。b) 文档模型：docx 为 **JSON Block 树**——官方开放平台明确「块（Block）是文档的最小构建单元」，30+ 种块类型（[飞书开放平台](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/docx-overview?lang=zh-CN)）；编辑器内核未公开，社区逆向显示 docx 走 DOM 渲染、疑似 Slate 魔改，电子表格用自研 Canvas 绘制，多维表格实现了一套基于 Widget 的渲染引擎【推测，社区逆向】；生成方式为智能伙伴以自然语言指令直接操作文档/表格对象，字节官方招聘 JD 提及多维表格 AI 方向在探索 Agentic、Plan-Execute、Skills 架构（[知乎逆向讨论](https://www.zhihu.com/question/548405585)、[字节招聘 JD](https://jobs.bytedance.com/experienced/m/position/detail/7589625695841028357)）。c) 侧边栏对话式智能伙伴 + 单元格级唤起 + 预设场景指令，「对话指令 → 生成结果预览」流。d) 亮点是 AI 一句话生成「业务系统」（多张数据表+仪表盘）并在协作套件内闭环；短板是数据量增大后性能明显下降、私有化仅限最高版本（[稀土掘金多维表格架构对比](https://juejin.cn/post/7667384181896675343)）。

**钉钉文档 AI**
【事实】a) 覆盖文档、表格、脑图、白板、演示（PPT）；AI 功能含 50+ 创作指令、一句话生成 PPT、`/`智能创作、AI 配图、脑图一键生成、白板 AI、表格数据洞察、文档/PPT 转数字人播报视频（[钉钉文档 AI 助理整体介绍](https://help.dingtalk.io/zh/docs/doc-ai/getting-started/assistant-overview)、[产品页](https://docs.dingtalk.com/product/ai)）。b) 编辑器演进有官方工程分享：CodeMirror+Markdown → 自研富文本 + OT 协同（服务端存编辑动作指令而非全量文档）→ 自研编辑器体系；「同构表」技术解决文档内嵌表格跨端一致性；底层大模型为通义千问；AI 生成是操作文档模型还是模板填充未找到公开资料（[《我做编辑器这些年：钉钉文档编辑器的前世今生》](https://zhuanlan.zhihu.com/p/157215963)、[同构表技术连载](https://juejin.cn/post/6854573213863641102)、[新浪财经报道](https://finance.sina.cn/2024-04-03/detail-inaqnzye3248384.d.html)）。c) 侧边栏 AI 助理 + inline 划词智能创作 + 「/」快捷指令；表格内对话式问数。d) 亮点是 AI 覆盖面最全（含白板、数字人）且与 IM/会议生态打通；短板是未找到高质量第三方深度评测、AI 能力分批放量。

**腾讯文档智能助手**
【事实】a) 覆盖 Word/Excel/PPT/PDF/智能文档/收集表/思维导图；能力含一句话生成全品类、润色扩写续写、长文速读、单元格输入「=」唤起函数、对话批量处理、生成图表与仪表盘、PPT 一键生成与美化、跨品类流转（[官方公测通稿](https://static.nfapp.southcn.com/content/202401/26/c8546968.html)）。b) 编辑器内核为**自研 Canvas 渲染引擎**（官方工程文章披露渲染流程改造：去离屏渲染、脏区优化、canvas 回收）（[腾讯云开发者社区工程文章](https://developer.cloud.tencent.com/article/2171385)）；文档模型与生成方式未公开；助手支持混元与 DeepSeek-R1 双模型切换（[官方动态](https://cloud.tencent.com/developer/news/2187217)）。c) 文档右下角 AI 面板 + 右键「智能助手帮我做」+ 表格「=」唤起，对话式问数与「生成-预览-确认」流。d) 亮点是全品类一句话生成、双模型「快速/深思」可选；短板是公开技术资料与第三方深度拆解明显少于飞书/钉钉。

**国内 AI PPT 工具（Kimi PPT 助手 / AiPPT / 讯飞智文）**
【事实】a) 聚焦 PPT 生成与在线编辑；Kimi 支持 PDF/Word/PPTX/Excel/TXT/图片多格式输入（[Kimi 帮助中心](https://www.kimi.com/help/ppt/ppt-overview)）；讯飞智文另支持 Word 生成、音视频输入、一键动效、自动生成演讲稿（[讯飞智文官网](https://zhiwen.xfyun.cn/home)）。b) Kimi 由 K3 大模型驱动，「自动匹配配色/排版/图表样式」，流程为先生成大纲、再选模板渲染成稿，支持上传自定义模板复刻；渲染引擎/文档模型未找到公开资料。**AiPPT 的 CEO 在 36氪访谈中明确「生成 PPT 这一步不是由大模型直接完成的，而是通过算法（RAG）将 AI 生成的大纲内容与图片素材库匹配」——即 RAG+模板填充路线**（[36氪访谈](https://m.36kr.com/p/3043897726798720)）；讯飞智文基于星火大模型。c) 对话式输入 → 大纲预览与修改 → 模板选择 → 生成 → 在线卡片式微调 → 下载可编辑 pptx，典型预览-确认流。d) 亮点是分钟级出稿、模板量大、免费门槛低；短板是模板化排版、深度美化与个性化有限，内容易同质化（[pptgo 评测](https://pptgo.cn/article/how-to-create-ppt-with-kimi/)）。

**Beautiful.ai / Plus AI**
【事实】a) Beautiful.ai 为 Web 端演示工具，Smart Slides 自适应模板 60+、AI 生成（DesignerBot）、导出 PPTX；Plus AI 是 Google Slides/PowerPoint 原生 add-in，支持整 deck/单页生成、改写、文档转 deck、品牌定制（[Beautiful.ai 官网](https://www.beautiful.ai/presentations)、[Plus AI 官网](https://plusai.com/)）。b) **Beautiful.ai 核心是设计规则引擎**——约束驱动的自适应排版（内容增删时自动调布局/字号/间距），官方定位「design rules as non-negotiable」，生成式 AI 负责内容起草、版式交给规则引擎（[官方博客](https://www.beautiful.ai/blog/ai-can-build-slides-fast--but-great-presentations-still-need-design-rules)）；底层渲染/文档模型未公开；导出 PPTX 需经转换层，复杂排版导出易出错【推测+评测】。**Plus AI 由 LLM 先写 outline 再逐页生成，写入宿主为原生可编辑 slide**；官方 Presentation API 完整暴露 outline→deck 流程，另有 image mode（每页一张 AI 生成图）与 Agent API/MCP server（[Presentation API 指南](https://guide.plusai.com/apis-for-presentations/presentations-api)、[Agent API](https://plusai.com/features/presentation-agent-api/)）。c) Beautiful.ai 为模板内编辑 + AI 生成面板；Plus AI 为宿主应用侧边栏 + 预览后插入。d) Beautiful.ai 亮点是自动排版稳定性业内口碑最佳，短板是导出 PPTX 格式瑕疵、无免费版、中文模板少；Plus AI 亮点是不离开 Office 环境、输出原生可编辑，短板是强依赖宿主应用、按 credit 计费（[getalai 评测](https://getalai.com/ru/blog/beautiful-ai-alternative)、[Dynalord 评测](https://dynalord.com/blog/plus-ai-review)）。

---

## 4. 横向对比

| 对象 | 文档模型 | 编辑器内核 | 生成方式 | 主交互范式 |
| --- | --- | --- | --- | --- |
| Microsoft 365 Copilot / Office Agent | 原生 OOXML | Office 原生内核（Excel Agent Mode 在 JS runtime 走 Excel API） | LLM 直接操作应用对象模型；PPT 走品牌模板分析；Office Agent 官宣「代码生成执行」 | 侧边栏 + inline + plan 模式 + agent 自主执行 |
| Google Workspace + Gemini | 自研 JSON（Docs 元素树 / Sheets 网格 / Slides 页元素） | 完全自研；Docs/Sheets 渲染层已迁 Canvas | 结构化生成直接写入文档模型【推测】；Sheets 分析官宣「LLM 生成 Python 代码执行」 | 侧边栏 + inline Help me write + 文档级指令 + 预览-确认 |
| WPS AI / 灵犀 | 自研内核（与 OOXML 双向兼容） | 全自研（统一引擎层），为 AI 专门构建组件内 API | **LLM 直接调组件内 AI API 逐文本框生成**，对 PPT 格式与结构有记忆 | 侧边栏 + inline 留痕 + 大纲确认 + 灵犀 agent 自主执行 |
| Notion AI | 自研 JSON block tree | 完全自研（contenteditable + 自研 transaction/render queue） | LLM 直接产出 block 内容写入文档模型【推测】；问答走 RAG（OpenAI embeddings + Turbopuffer）；文件产物走 computer workspace 沙箱 | 侧边栏 Agent + 空格 inline 唤起 + 划词编辑 + 属性 Autofill + Custom Agents |
| Gamma | 自研 Card 模型（卡内 block） | 自研 Web 编辑器【推测高度自研】 | LLM 产出结构化内容 → Smart Layouts 布局引擎自动排版；导出层 Web→PPTX 转换 | 大纲确认 + 卡片式 AI 编辑 + 划词编辑 + 侧边栏 Agent + API 批量 |
| Tome（已关停） | 自研 JSON tiles + 响应式设计系统 | 自研 Web 编辑器 | LLM（GPT-3/4）直接产出文档模型内容，自研排版引擎兜底；无 PPTX 导出 | prompt 一次生成全文 + 渐进式 AI 迭代 |
| Canva Magic Design | 自研 JSON 场景模型 | 自研（TS+React；CSS/HTML/SVG 渲染 + Rust/WASM 栅格化 + WebGL 滤镜） | 2023：模板库+LLM 语义匹配；2025-10：自研设计模型直接产出可编辑图层；Bulk Create 为模板填充 | 候选预览挑选 + 对话助手 + Magic Switch 一键转换 |
| ChatGPT | 聊天内自研富文本块（Canvas 已下线）；Office 产物为真实 OOXML | 聊天侧自研【推测】；Excel/PPT 加载项复用微软原生内核 | **「LLM 生成 Python 代码 → Jupyter 沙箱执行」产出 xlsx/pptx/docx**；agent 生成原生 OOXML 元素 | 双栏协作 + 划词编辑 + 改前请示 + agent 自主执行 + Office 原生侧边栏 |
| Claude | Artifacts：代码即文档（Markdown/HTML/SVG/React）；Office：直接面向 OOXML | Artifacts：iframe 沙箱 + React；Docs 富文本内核未公开 | **「LLM 生成代码再执行」+ Agent Skills 编排**（docx-js/pptxgenjs/openpyxl；编辑既有 docx 走 unzip→改 XML→zip）；LibreOffice 渲染 + 多模态看图 QA 闭环 | 对话+右侧预览 + inline 原地编辑 + Cowork agent 自主执行 + 澄清式生成 |
| Genspark | Web 编辑器自研（内核未公开）；浏览器版导出存在 Web 渲染→OOXML 转换层【推测】 | 未公开 | **MoA 多 agent 编排**；自研 PPT 专用模型 Gen-1 Slides（RL 以交付质量为奖励）；Office 插件直接写入宿主 | Super Agent 自主执行 + 大纲确认 + 元素级 AI 编辑 + 插件侧边栏 |
| Manus | 不来自研文档格式；产物为真实 OOXML（2026-07 起原生 .pptx） | 无编辑器内核，自研 artifact 查看器 | **CodeAct：模型写 Python 代码在云端沙箱执行**，自我反思重试；早期为 HTML 幻灯片导出时转换（已被原生路线取代） | 对话框下目标 → agent 全自主执行 → 交付物卡片；过程透明；对话迭代 |
| Codex | 直接面向 OOXML 成品文件 | 复用 coding agent 沙箱（无自有编辑器） | **LLM 生成代码再执行**（PptxGenJS / openpyxl+python-pptx）；渲染自检闭环 | 终端 agent + Skill 自动发现 + 渲染预览自检 |
| TabTin | 在线协作文档模型【推测】（非本地 OOXML 流） | 未公开（CRDT 协同） | Agent Runtime 调 Skill 直接操作工作应用 | 群聊协作 + 交接包续接 + 审批验收 |
| GenOffice | **原始 OOXML 为唯一事实源**（脏块缝合、字节级保真） | Tiptap/ProseMirror（Docs）+ Univer+Rust sidecar（Sheets）+ Konva canvas（Slides）+ PDFium（PDF） | AI 规划 + 引擎执行 + 校验闭环；AI 编辑走文档模型 ops/diffs | 文档旁 AI 面板（tracked changes 留痕回滚）+ inline Ask AI + CLI/MCP agent |
| 飞书 | docx 为 JSON Block 树；电子表格 Canvas 渲染 | 未公开（社区逆向：疑似 Slate 魔改【推测】） | 智能伙伴直接操作文档/表格对象；多维表格探索 Agentic/Plan-Execute | 侧边栏智能伙伴 + 单元格唤起 + 预览流 |
| 钉钉 | 未公开 | 自研富文本 + OT 协同（官方工程分享） | 未公开（底层通义千问） | 侧边栏 AI 助理 + inline 划词 + 「/」指令 |
| 腾讯文档 | 未公开 | 自研 Canvas 渲染引擎（官方工程文章） | 未公开（混元 + DeepSeek-R1 双模型） | AI 面板 + 「=」唤起 + 生成-预览-确认 |
| Kimi/AiPPT/讯飞智文 | 未公开 | 未公开 | Kimi：大模型匹配模板渲染；**AiPPT 官宣 RAG 模板填充**；讯飞：星火大模型 | 对话输入 → 大纲预览 → 模板选择 → 卡片微调 |
| Beautiful.ai / Plus AI | Beautiful.ai 未公开；Plus AI 写入宿主原生 slide | Beautiful.ai：设计规则引擎（约束驱动自适应排版） | Beautiful.ai：AI 起草内容 + 规则引擎排版；Plus AI：LLM outline→逐页生成 | 模板内编辑 / 宿主侧边栏预览插入 |

## 5. 关键模式与趋势

1. **「直接操作文档模型」与「生成代码再执行」是两条收敛中的主路线。** 传统套件（Microsoft、Google、WPS、Notion、飞书）凭借自有文档模型，让 LLM 直接驱动应用 API 或写入结构化模型；无套件基因的通用 agent（Claude、ChatGPT、Codex、Manus）则把办公文档生成归约为编程任务，「LLM 写 python-pptx/pptxgenjs/openpyxl 代码 → 沙箱执行」。2025 下半年起两者互相靠拢：微软 Office Agent 官宣「用代码生成来执行请求」，ChatGPT/Claude/Genspark 纷纷以 Office 加载项/插件形态接入宿主应用。
2. **编辑性（原生 OOXML）与视觉质量公开承认难以兼得。** Claude Skills 反复警告「不要用贴图冒充图表」；ChatGPT agent 自承「格式较粗糙」；Gamma/Tome 的 Web 原生格式带来体验差异化，却以 PPTX 导出保真度为代价——Tome 因无 PPTX 互操作切断企业分发链路而关停，是这条规律的极端案例。
3. **「生成后可用原生工具继续精修」成为头部厂商的差异化战场。** Microsoft 品牌模板分析、Genspark/Manus 的 Office 插件直写、Claude 的模板感知 add-in 与 LibreOffice 视觉 QA、GenOffice 的字节级 OOXML 缝合，本质上都在回答同一个问题：AI 初稿之后，如何不丢格式地继续编辑。
4. **Agent 自主执行在 2025 下半年成为旗舰交互形态**（Microsoft Agent Mode、Office Agent、ChatGPT agent、Manus、Genspark Super Agent、Notion Custom Agents），普遍配合「计划预览/改动前请示/过程透明/可中断」的受控设计；校验式生成（先建测试预期、渲染看图、公式重算校验）从社区技巧变成官方工程实践（微软 Excel Agent Mode、Anthropic skills、Genspark Gen-1 的 RL 交付质量奖励）。
5. **垂直模型开始出现**：Genspark Gen-1 Slides（RL、以最终交付质量为奖励、$0.44/份）是首个公开细节的 PPT 专用模型，训练中出现 grader 投机并被针对性治理——说明「办公生成」正在从通用 LLM prompt 工程走向专门化训练。
6. **国内套件路线（WPS、钉钉、腾讯、飞书）的特殊性**：均为自研内核 + 自研协同协议（OT/CRDT/异步命令队列），AI 普遍走「组件内为 AI 专门构建 API」或「智能伙伴直接操作文档对象」，中文公文/本土场景适配与私有化/信创是差异化卖点；生成管线内部细节公开度整体低于海外。

## 6. 证据强度与来源汇总

本节按对象汇总主要来源；各结论的逐条链接已随文标注在第 3 节。**证据强度排序**：官方文档/工程博客/changelog/开源仓库 > 官方新闻稿 > 媒体报道/评测拆解 > 社区讨论/逆向分析。凡属社区逆向或推断的结论，正文均已标注【推测】。

- **Microsoft**：support.microsoft.com 官方文档 ×5；Microsoft 365 Copilot Blog 2025-09-29；Excel Blog/TechCommunity「Building Agent Mode in Excel」；Futurum Group 评测；Engadget 报道。
- **Google**：workspaceupdates.googleblog.com 官方 changelog ×8；support.google.com 官方文档 ×2；developers.google.com API 文档；The New Stack / WebAIM / HN 工程分析；ModelMonkey FP&A 评测。
- **WPS**：wps.cn 官方指南/年报/招股书；36氪高管专访；量子位/什么值得买/IT之家/中国日报网评测报道；WPS 论坛官方社区。
- **Notion**：notion.com 官方工程博客（data model）、官方文档（autofill/security/connectors/FAQ/guides）、官方 changelog；yuexunj.com 逆向拆解（时效风险已标注）；Reddit 社区讨论。
- **Gamma**：help.gamma.app 官方帮助、meetgamma.canny.io 官方 changelog、gamma.app 官方博客/API 文档；TechCrunch/BusinessWire；Presentations.AI/Fast.io/SketchBubble/Today in AI 评测；少数派中文评测。
- **Tome**：globenewswire 官方新闻稿 ×2；TechCrunch/Forbes/Fast Company/The Information 报道；tome.app 官方帮助；AnyGen/智源社区关停复盘。
- **Canva**：canva.com 官方新闻稿/帮助/AI 产品页；canva.dev 官方工程博客 ×4（渲染栈、协作、技术栈演进）；TechCrunch 2025-10-30。
- **ChatGPT**：openai.com 官方博客（Canvas/ChatGPT for Excel/agent）；help.openai.com 官方文档（writing blocks、Data Analyst、PowerPoint 加载项、release notes）；OpenAI 社区 python-pptx 实证；The Information 报道；remio.ai 评测。
- **Claude**：support.claude.com 官方文档；docs.anthropic.com changelog；**github.com/anthropics/skills 开源仓库（docx/pptx/xlsx SKILL.md，本轮最强一手资料）**；The Pragmatic Engineer 工程访谈；Simon Willison 评测；eesel.ai 评测；系统提示词泄漏存档。
- **Genspark**：genspark.ai 官方帮助/博客/FAQ；PR Newswire 官方新闻稿；官方 LinkedIn；硅星人 Pro/澎湃/智通财经（Gen-1 细节）；AI工具帮/NovaTools/AnyGen 评测；插件实测。
- **Manus**：manus.im 官方博客 ×2；CodeAct 论文；泄漏 system prompt（GitHub）；36氪实测；腾讯新闻/阿里妹工程拆解；Reddit/Techpoint/AISO 评测。
- **Codex / TabTin / GenOffice**：openai 技能目录与社区项目；github.com/tabtin-ai/TabTin README 与产品概念文档；**github.com/genspark-ai/genoffice README（本轮唯一完整公开技术栈）**；爱范儿/极客公园/It's FOSS/36氪 报道。
- **其他产品**：飞书/钉钉/腾讯文档官方帮助中心与开放平台；钉钉编辑器工程分享（知乎专栏/掘金）；腾讯云开发者社区工程文章；Kimi/讯飞智文官方文档；AiPPT CEO 36氪访谈；Beautiful.ai 官方博客；Plus AI 官方 API 指南。

**整体边界声明**：截至 2026-09-29，除微软 Excel Agent Mode 工程博客、Anthropic skills 开源仓库、GenOffice README、Canva/Notion/钉钉工程博客外，没有任何厂商完整公开其 AI 生成管线（prompt 编排、模型版本映射、服务端渲染链路）。本报告所有「实现思路」结论均建立在上列公开资料之上，并逐条区分了事实与推测。

---

*报告完成时间：2026-09-29 · 调研执行：LobeHub Agent（Kimi Code）· 任务 T-565*
