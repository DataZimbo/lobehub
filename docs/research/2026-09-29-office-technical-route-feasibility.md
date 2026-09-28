# LobeHub Office 能力技术路线可行性分析报告

> - **任务**：T-570「输出 office 能力技术路线的可行性分析」
> - **所属 Goal**：AI Office 能力：市场全景调研、可行性分析与架构路线图（本阶段只做调研与设计，不进入产品实现）
> - **日期**：2026-09-29
> - **分支**：`research/ai-office-agent`，本文件位于 `docs/research/`
> - **输入**（同分支 `docs/research/` 下三份报告，结论均直接引用）：
>   1. 《主流商业 AI 办公产品 Office（PPT/Excel/Word）实现思路调研报告》（T-565，下称**商业调研**）
>   2. 《开源 Office 引擎与 AI 办公开源方案调研报告》（T-566，下称**开源调研**）
>   3. 《LobeHub 现有实现与 Office（PPT/Excel/Word）能力的复用点与缺口分析》（T-567，下称**现状分析**）
> - **性质**：纯可行性分析报告，不含任何产品实现代码。成本为基于 LobeHub 现有代码事实（工具框架、预览组件、沙箱、编辑器协议均已存在）的粗量级估计，精度 ±50%，供路线决策使用。

---

## 0. 摘要（TL;DR）

对 6 条候选技术路线做了依赖、成本、四维风险、栈契合度与成熟度的量化评估，结论：

1. **没有单一路线能覆盖「生成 → 预览 → 编辑 → 协同 → 高保真」全谱系**，可行解必然是组合。推荐主路线为 **「R1 代码生成 OOXML（底座）＋ R2 结构化中间层导出（体验层）」先行，R4 开源 SDK 嵌入（Univer，表格/文档件编辑面）中期落地，R5 独立服务（OnlyOffice/Collabora、presenton）按需开启，R3 自研版式编辑器短期明确不立项，R6 模板填充仅作 R1 的增强技巧而非独立路线**。
2. **R1 是当下唯一「2–3 人周即可上线、License 完全干净（MIT）、业界已量产验证」的路线**：cloud-sandbox 现成、fileEditScan 已认识 office 产物、FileViewer 已能预览三件套——每一步都是纯增量。
3. **主要不确定性不在技术而在两个待验证项**：①云沙箱内能否安装 python office 库（现状分析 G9，网络策略无本地事实依据）；②Univer Pro 的采购条款与报价（xlsx 高保真导入导出、实时协同均在商业层）。两项都已列入 PoC 清单，均不构成路线级否决。
4. **License 红线清晰**：OnlyOffice（AGPL-3.0）、TabTin/PPTist/banana-slides（AGPL）只能以独立服务方式使用、严禁代码并入主仓库；Handsontable（自定义非商业许可）已排除；Univer 核心 Apache-2.0 是唯一能代码级引入的 Office SDK。生成三件套（PptxGenJS/docx/exceljs）与 reveal.js 全 MIT，无成本。

---

## 1. 分析框架与评分口径

### 1.1 评估维度（对应任务书 b 项）

每条路线按七个维度评估：**依赖**（引入什么、以什么形态）、**实现成本**（人周，基于现状分析确认的 LobeHub 既有资产折算）、**License 风险**、**维护风险**、**性能风险**、**协同能力**、**与现有栈契合度**（Next.js 16 / React 19 / `@lobehub/editor` Lexical / TRPC / cloud-sandbox）。

### 1.2 量化评分口径

| 分值 | License 风险 | 维护风险 | 性能风险 | 协同能力 | 栈契合度 |
|---|---|---|---|---|---|
| 0 | —（自有代码） | 无外部依赖 | 无运行时负担 | 无 | 完全无关 |
| 1 | MIT/Apache-2.0，直引无限制 | 活跃维护（近半年有 release） | 纯 CPU、包体 < 2MB | 文件级产物 | 可运行但需适配层 |
| 2 | MPL-2.0 或 AGPL 限独立服务用法 | 维护放缓但有替代路径 | 需代码分割/异步化 | 需自建基础 | 直接复用现有框架 |
| 3 | 双轨制（Open Core）关键能力在商业层 | 实质停摆/需锁版或分叉 | MB 级包体或服务端重资源 | 架构底座在、服务端需自建 | 核心抽象同构 |
| 4 | 自定义非商业许可（已排除项） | 无维护且无替代 | 每文档一进程级资源消耗 | 开箱即用但形态黑盒 | — |
| 5 | — | — | — | — | 现有资产零改造承接 |

> 成本口径：1 人周 ≈ 1 名熟悉本仓库的工程师一周的净产出。现状分析 §5.4 已列明「新增一个 builtin tool 需要动的 8 个层全部为纯增量」，本报告的低成本估计正是建立在该事实之上。

---

## 2. 候选路线枚举（任务书 a 项）

从两份调研报告的实现思路分类中，归纳出 6 条对 LobeHub 有候选意义的技术路线：

| 编号 | 路线 | 一句话定义 | 市场参照 | 开源对应 |
|---|---|---|---|---|
| **R1** | 代码生成 OOXML | LLM 生成代码（python-pptx/pptxgenjs/openpyxl 等）在沙箱或服务端执行，产出真实 Office 文件 | Claude Skills、ChatGPT Data Analyst、Manus CodeAct、Codex | PptxGenJS / docx / exceljs |
| **R2** | 结构化中间层 + 导出 | 以 LobeHub 自有 LiteXML/Markdown 文档模型为中间层，单向/双向转换 OOXML | Gamma（Web→PPTX 转换层）、Plus AI、Microsoft 品牌模板 | docx 库 patchDocument、genoffice 块锚定范式 |
| **R3** | 自研版式编辑器 | 自研幻灯片/工作表画布编辑器（自研文档模型 + 渲染引擎） | Google（全自研）、WPS 统一引擎层、Canva、PPTist | PPTist（Vue，AGPL 参考）、TabTin |
| **R4** | 开源 SDK 嵌入 | npm 嵌入 Univer 获得表格/文档件编辑面 | 飞书/钉钉自研表格的同形态开源替代 | Univer（Apache-2.0） |
| **R5** | 独立服务接入 | 自部署现成服务，经 iframe / MCP / REST 接入 | ChatGPT for PowerPoint（寄生宿主）、Genspark 插件 | OnlyOffice / Collabora / presenton / PPTAgent / genoffice CLI |
| **R6** | 模板填充 / RAG | LLM 生成大纲，模板库匹配 + 规则引擎排版 | AiPPT（官宣 RAG）、Canva 早期 Magic Design、Beautiful.ai | presenton 模板体系 |

---

## 3. 逐路线可行性分析（任务书 b 项）

### R1 代码生成 OOXML —— 生成底座

- **依赖**：服务端/沙箱引入 PptxGenJS 4.0.1、docx 9.8.1、exceljs 4.4.0（npm，全 MIT，合计 < 2MB gzip 前）；或复用 cloud-sandbox 内 python-pptx/openpyxl/python-docx。形态：新增 `lobe-office` builtin tool（或先扩展 cloud-sandbox apiName）。
- **实现成本**：**2–3 人周**（manifest/systemRole/ExecutionRuntime/服务端 runtime/前端 executor/Inspector/i18n 八个增量层，框架全部现成）。另需 1–2 人周做「渲染自检闭环」（生成→LibreOffice/预览渲染→多模态看图查错，Claude Skills 已验证该闭环有效）。
- **License 风险：1**（MIT 三件套）。
- **维护风险：2**——exceljs 实质停摆（最后 push 2025-01，809 open issues）需锁版或采用 `@protobi/exceljs` 分叉；pptxgenjs 维护放缓但可用；docx 活跃。SheetJS npm 版带未修复 CVE，若用于解析须 vendor CDN 版（开源调研 §2.4.4）。
- **性能风险：1**——纯 CPU 同步生成，大文档应放 worker/队列；包体小。
- **协同能力：1**——产物是文件，天然无协同。
- **栈契合度：5**——cloud-sandbox（13 API）现成、fileEditScan 已识别 `python-pptx .save()`/`pptxgenjs writeFile` 等模式并归类 slides/sheet/doc Work、FileViewer 三件套预览现成、`exportFile`→`/f/:id` 文件链路现成。
- **成熟度：L3（业界量产）**。商业调研 §3.8/3.9/3.11/3.12 显示 Claude/ChatGPT/Manus/Codex 全部以此为主路线，Anthropic skills 仓库给出完整工程范本。
- **主要风险**：生成质量依赖 prompt 与自检闭环，视觉上限平庸（Codex 路线被评「干净但企业平庸」）；沙箱网络策略对 python 库可用性的影响待验证（现状分析 G9）。

### R2 结构化中间层 + 导出 OOXML —— 体验层

- **依赖**：同 R1 生成库 + 自研「LiteXML/Markdown → OOXML」转换层（docx 走 docx 库声明式对象树、pptx 走 PptxGenJS、xlsx 走 exceljs）；进阶方向是吸收 genoffice「块锚定 OOXML + 脏区重写 + 字节保留回写」范式做双向编辑（开源调研 §3.1）。
- **实现成本**：单向导出 **4–6 人周**（定义映射规范 + 三格式导出器 + 预览链路复用）；双向保真编辑 **10–16 人周起**（块锚定、脏区缝合、样式保真，genoffice 一人一周仅做出 Alpha 可作为下界参照）。
- **License 风险：1**。
- **维护风险：2**——转换层是长期维护面；版式语义（分页/母版/工作表）在 Markdown 中不存在，映射规则需持续打磨。
- **性能风险：2**——双向编辑涉及整文件解析/回写，需设计增量策略。
- **协同能力：2**——自有文档模型侧可继承 `@lexical/yjs` 底座。
- **栈契合度：5**——liteXML 协议与 genoffice `docs read --range`/`docs apply --ops` 协议「高度同构」（开源调研核心结论），headless 编辑器可在服务端做转换校验；EditorCanvas/Portal 保存链路现成。
- **成熟度：单向 L3（Gamma 转换层、WPS 文档转 PPT 均量产）；双向 L2（仅 genoffice 给出公开实现且自评 Alpha）**。
- **主要风险**：版式语义鸿沟导致「能导出但不好看」；Tome 关停教训（商业调研 §3.6）——私有格式切断 OOXML 互操作是致命短板，LobeHub 若以自有模型为终点而不通 OOXML，会重蹈覆辙。故 R2 必须与 R1 的 OOXML 产物打通，而非替代它。

### R3 自研版式编辑器 —— 重型自研

- **依赖**：无外部引擎依赖（Konva/自研 Canvas 或 DOM+SVG）；需新建幻灯片/工作表文档模型与渲染、磁吸对齐、母版/版式系统等全套编辑器交互（PPTist 的 9.4k star 证明了工程量级）。
- **实现成本**：幻灯片编辑器 **16–32 人周**；工作表编辑器 **32–64 人周**（含公式引擎对接）；协同另算。对比：Google Docs 渲染层迁移投入以年计、WPS 自研内核以百人年计。
- **License 风险：0**（自有代码）。
- **维护风险：4**——长期重投入，编辑器是永续工程。
- **性能风险：3**——Canvas/DOM 混合渲染、大文档虚拟化均需自研调优。
- **协同能力：1**——`@lexical/yjs` 底座不覆盖画布场景，需自建。
- **栈契合度：3**——React 19/TS 契合，但 `@lobehub/editor` 是 DOM 富文本内核（Lexical），版式画布需另起炉灶，无法复用其插件栈。
- **成熟度：L1–L2（对 LobeHub 而言）**。
- **主要风险**：投入产出比最差；PPTist/Gamma 多年打磨才达 95% 导出保真；会挤占生成层与编辑层的落地窗口。**结论：短期（12 个月内）不立项**。

### R4 开源 SDK 嵌入（Univer）—— 表格/文档件编辑面

- **依赖**：`@univerjs/*` presets（Apache-2.0，TS monorepo，React 19 适配，v1.0.2 2026-09-24）；xlsx/docx 高保真导入导出与实时协同在 **Univer Pro 商业层**。
- **实现成本**：PoC **2–4 人周**（preset 嵌入 + headless 工具封装）；生产化 **8–12 人周**（preset 自组装 UI 外壳、与 builtin-tool 框架接线、文件导入导出适配层）；若选「自建格式适配层」替代采购，另加 6–10 人周。
- **License 风险：2**——核心 Apache-2.0 干净；但关键能力在 Open Core 商业层，采购条款/SaaS 转售权待确认（🔶）。
- **维护风险：2**——社区活跃（21k stars，近半年迭代极快），「The Office Harness for AI Agents」定位与 LobeHub agent 化方向同向。
- **性能风险：2**——MB 级包体，Web 端需按 surface 代码分割；Electron 桌面端无感。
- **协同能力：2**——OSS 版有序列化底座，实时协同服务端在 Pro 层。
- **栈契合度：5**——TS/React 19/Node headless 同构，与 `packages/editor-runtime` 的「浏览器 + 服务端共享编辑计划器」架构完全同构；genoffice Sheets 已验证 Tiptap+Univer 组合路线。
- **成熟度：L3（genoffice 量产验证）/ L2（LobeHub 内集成待 PoC）**。
- **主要风险**：Pro 层依赖的两条岔路（采购 vs 自建适配层）都需实测 xlsx 保真度后才能定（开源调研 §5.4 已将其列为 PoC ①）。

### R5 独立服务接入 —— 按需增值

三个子方向，成本/风险差异大，分开评：

| 子方向 | 内容 | 集成成本 | 运行成本 | License 风险 | 协同 | 栈契合度 | 成熟度 | 结论 |
|---|---|---|---|---|---|---|---|---|
| 5a 套件编辑器 | OnlyOffice（AGPL-3.0）或 Collabora（MPL-2.0）自部署 + iframe/WOPI | 2–4 人周 | 镜像 700MB–1GB 常驻容器；Collabora 每文档一进程 | 2（仅限独立服务用法，严禁代码并入） | 4–5 开箱即用 | 3（iframe 黑盒、账号/权限体系割裂、品牌受限） | L3（40+ 连接器实践） | **云端可选增值模块**，OSS 自托管 docker-compose 可选 profile；二选一（倾向 Collabora 的 MPL 低风险 + 格式面广，或 OnlyOffice 的 OOXML 保真 + 客户端性能） |
| 5b AI PPT 服务 | presenton（Apache-2.0，内置 MCP server）或 PPTAgent（MIT，反思闭环）自部署 worker | 1–2 人周 | presenton 镜像 ~800MB；PPTAgent 需 LibreOffice+Playwright+Python 3.12 | 1 | 1 | 3（MCP/REST 接入，产物回传 LobeHub 文件系统） | L3 | **AI PPT 最快落地通道**，作为自研 slide 编辑面成熟前的过渡；生成质量受模板库约束 |
| 5c 文档处理 worker | genoffice CLI（headless，29 个 MCP 工具）自部署 | 1–2 人周 | 每 worker 需 Electron 运行时（150–190MB，headless 需 xvfb） | 1 | 1 | 4（`docs read/apply --ops` 协议与 LiteXML 同构，直接范本） | L2（引擎未发 npm，Alpha 自评） | 作架构范本优先；服务化接入次之 |

- **共同风险**：服务可用性/升级运维、容器资源、AGPL 边界合规需立规（开源调研 §4.3 四条红线）；iframe 形态的账号体系与品牌一致性弱于原生嵌入。

### R6 模板填充 / RAG —— 增强技巧

- **依赖**：自建模板库（HTML/Tailwind 或 PPTX 母版）+ LLM 大纲生成 + 匹配/填充引擎；可借 presenton 模板体系。
- **实现成本**：MVP **4–8 人周**（模板库建设是长期运营投入，非一次性工程）。
- **License 风险：1**。
- **维护风险：3**——模板库需要持续运营，否则同质化（国内 AI PPT 工具「模板化排版、内容易同质化」的通病，商业调研 §3.15）。
- **性能风险：1**。
- **协同能力：0–1**。
- **栈契合度：4**。
- **成熟度：L3（AiPPT 官宣 RAG 路线、Canva 早期、Kimi 均量产）**。
- **结论**：不作为独立技术路线立项；其「模板约束提升视觉下限」的思想应吸收进 R1 的生成管线（品牌模板 + 渲染自检）， beautiful.ai 的「设计规则引擎」同理。

---

## 4. 量化成本/风险对比总表（任务书 b 项验收要求）

| 路线 | 首版成本（人周） | 规模化成本 | License 风险 | 维护风险 | 性能风险 | 协同能力 | 栈契合度 | 成熟度 | 综合可行性 |
|---|---|---|---|---|---|---|---|---|---|
| **R1 代码生成 OOXML** | **2–3** | +1–2（自检闭环） | 1 | 2 | 1 | 1 | 5 | L3 | ★★★★★ 立即做 |
| **R2 中间层导出（单向）** | 4–6 | 长期维护面 | 1 | 2 | 2 | 2 | 5 | L3 | ★★★★☆ 随 R1 第二期 |
| **R2 中间层（双向保真）** | 10–16 | 高（长期打磨） | 1 | 2 | 2 | 2 | 5 | L2 | ★★★☆☆ 观察 genoffice 演进后立项 |
| **R3 自研版式编辑器** | 16–64 | 永续重投入 | 0 | 4 | 3 | 1 | 3 | L1–L2 | ★☆☆☆☆ 12 个月内不立项 |
| **R4 SDK 嵌入（Univer）** | PoC 2–4 / 生产 8–12 | Pro 采购或自建适配 | 2（Open Core） | 2 | 2 | 2 | 5 | L3/L2 | ★★★★☆ PoC 先行 |
| **R5a 套件 iframe** | 2–4 | 常驻容器运维 | 2（AGPL 边界） | 2 | 3–4 | 4–5 | 3 | L3 | ★★★☆☆ 云端按需 |
| **R5b AI PPT worker** | 1–2 | 镜像运维 | 1 | 2 | 2 | 1 | 3 | L3 | ★★★★☆ 快落地通道 |
| **R5c genoffice worker** | 1–2 | Electron/xvfb 运维 | 1 | 3（Alpha） | 2 | 1 | 4 | L2 | ★★★☆☆ 范本优先、接入次之 |
| **R6 模板填充/RAG** | 4–8 | 模板库运营 | 1 | 3 | 1 | 0–1 | 4 | L3 | ★★★☆☆ 并入 R1 管线，不独立立项 |

> 评分口径见 §1.2；「综合可行性」为七维加权后的定性档位（成本与栈契合度权重最高），用于排序而非精确计算。

---

## 5. 成熟度评估与分阶段可行性（任务书 c 项）

成熟度分级：**L3** = 业界已量产、可直接引入；**L2** = 有公开实现但需 PoC 验证；**L1** = 概念阶段或需从零自研。

| 阶段 | 时间窗 | 路线组合 | 交付形态 | 可行性依据 |
|---|---|---|---|---|
| **P0** | 0–1 月 | R1 | agent 生成 docx/xlsx/pptx 产物 + FileViewer 预览 + 渲染自检闭环 | 所有依赖（沙箱/工具框架/预览/文件链路）现状已就绪；业界四家有完整公开范本 |
| **P1** | 1–3 月 | R1 增强 + R2 单向 + R5b（可选） | 自有文档/Markdown → docx/pptx 导出；presenton worker 提供模板化 AI PPT | liteXML↔OOXML 映射规范可对照 genoffice ops 协议设计；presenton MCP 接入 1–2 人周 |
| **P2** | 3–9 月 | R4 生产化 + R5a（云端可选） | Univer 表格/文档件界面内编辑；云端增值「真 Office」iframe 模块 | Univer PoC（2–4 人周）先行验证 Pro 采购 vs 自建适配；OnlyOffice/Collabora 按云端用户需求开启 |
| **P3** | 9 月+ | R2 双向 / R3 重评估 | docx 块锚定保真编辑；若 R4/R5 均不满足核心场景再评估自研 slide 编辑面 | 双向编辑依赖 genoffice 范式验证与自研打磨；R3 立项前提是 R4+R5 证伪 |

**阶段性否决项（Go/No-Go）**：
- P0 的 No-Go 项：云沙箱 python 库不可用（G9）→ 降级为服务端 Node 生成库路线（PptxGenJS/docx/exceljs 纯 npm，不受影响）。
- P2 的 No-Go 项：Univer xlsx 保真度不达标或 Pro 条款不可接受 → 转向 R5a 套件 iframe 承载表格编辑，或推迟编辑面。

---

## 6. 选型建议与理由（任务书 d 项）

### 6.1 建议

**主路线：R1 + R2（生成层与中间层组合）为底座，R4 为中期编辑面，R5 为按需增值；明确不做 R3（12 个月内），R6 降级为 R1 管线的模板约束技巧。**

用一句话概括：**「先做能生成真实 OOXML 的 agent 底座（R1），再把自有文档体验接到 OOXML 上（R2 单向），表格/文档件的界面内编辑用 Univer 补齐（R4），『真 Office』全功能与现成 AI PPT 以服务形态按需挂载（R5），自研编辑器（R3）只在 R4/R5 证伪后启动。」**

### 6.2 论证链

1. **市场证据（商业调研）**：两条主路线正在收敛——有套件者（Microsoft/Google/WPS）让 LLM 直接操作文档模型，无套件者（Claude/ChatGPT/Manus/Codex）全部走「代码生成 OOXML」。LobeHub 没有 Office 套件基因，**代码生成路线（R1）是唯一被四家头部独立验证过、且不需要自研编辑器即可落地的路线**；头部差异化战场在「生成后原生精修」，对应 LobeHub 的 R2 + 渲染自检闭环。
2. **开源证据（开源调研）**：20 个对象中生成三件套全 MIT、Univer 是唯一可代码级引入的生产级 Office SDK（Apache-2.0）、OnlyOffice/Collabora 只能独立服务（License 红线已立）；genoffice 证明了「Tiptap + Univer + Konva」低成本拼装全格式的可行性，其块锚定协议与 LiteXML 同构——**R1/R2/R4 的每一块都有 License 合规的落地路径，且不需要为许可证付费**（除可选的 Univer Pro）。
3. **现状证据（现状分析）**：LobeHub 已具备 R1 的全部链路边界（沙箱、fileEditScan 识别、三件套预览、exportFile 文件链路），缺的是中间的 Office 语义层；liteXML + editor-runtime 的量产闭环是 R2 的直接载体；builtin-tool 五面孔框架让新增工具纯增量。**框架层不是瓶颈，主要决策点在文档模型与格式层**——这正是 R2/R4 的位置。
4. **成本证据（§4 量化表）**：R1 首版 2–3 人周、风险分全低；R3 16–64 人周、维护风险 4；R4 居中且有现成范本。组合路线在每个阶段都保留了「可交付的增量价值」，不存在需要长期投入才有产出的单点。
5. **风险证据**：唯一的环境级不确定性（沙箱网络 G9）有 Node 生成库的降级路径；唯一的商业层不确定性（Univer Pro）有「自建适配层」与「R5a iframe」双备选——**主路线没有任何一个不可降级的外部依赖**。
6. **反例校验**：Tome 因私有格式无 OOXML 互操作而关停（商业调研 §3.6）→ 否决「以自有模型为终点」的路线设计，R2 必须与 R1 的 OOXML 产物打通；Gamma 的 PPTX 导出保真痛点 → 渲染自检闭环（R1 增强）优先于版式引擎自研。

### 6.3 明确的 Do / Don't

- **Do**：P0 启动 R1；同步进行 G9 沙箱网络验证与 Univer Pro 采购评估两个 PoC；把开源调研 §4.3 的四条 License 红线写入工程规范。
- **Don't**：12 个月内不立项 R3；不将任何 AGPL 代码并入主仓库；不迁移 Lexical → Tiptap/Plate/Slate；不引入 Luckysheet/impress.js/Handsontable；R6 不独立立项。

---

## 7. 关键假设与不确定性

| # | 假设/不确定性 | 影响 | 缓解 |
|---|---|---|---|
| U1 | 云沙箱可安装 python office 库（G9） | R1 的 python 路径 | Node 生成库纯 npm 降级；P0 第一件事即验证 |
| U2 | Univer Pro 报价与 SaaS 转售条款 | R4 生产化成本 | PoC 用 OSS 层先验证价值；备选 R5a 承接 |
| U3 | exceljs 停摆期的供应链 CVE | R1 xlsx 生成 | 锁版或 `@protobi/exceljs` 分叉，package.json 记录理由 |
| U4 | genoffice 引擎未来发布独立 npm 包 | R2 双向/R5c 成本 | 开源调研已列「若发布应重新评估」；每季度跟踪 |
| U5 | 人周估计 ±50% 精度 | 排期 | 各阶段设 Go/No-Go 检查点（§5） |

---

## 8. 附录：输入报告与引用

| 输入 | 文档 | 本报告引用章节 |
|---|---|---|
| 商业调研 | `ai-office-implementation-survey.md`（T-565） | §3 R1/R2/R3/R6 市场参照、§6.2 论证链 1/6 |
| 开源调研 | `2026-09-29-open-source-office-survey.md`（T-566） | §3 全路线依赖/License/风险、§6.2 论证链 2、§6.3 License 红线 |
| 现状分析 | `2026-09-29-lobehub-office-capability-reuse-gap-analysis.md`（T-567） | §3 栈契合度评分、§5 P0 可行性、§6.2 论证链 3 |

*报告完成时间：2026-09-29 · 调研执行：LobeHub Agent（Kimi Code）· 任务 T-570*
