# YOYO 主播端小程序 Figma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建一份覆盖主播端全部 10 个业务路由、关键状态和可复用组件的 YOYO 品牌 Figma UI 文件。

**Architecture:** 先创建独立 Figma 文件与 9 个页面，再建立颜色变量、文字样式、效果样式和组件库。业务界面按登录入驻、活动提报、记录、培训岗前、个人中心五组逐步制作，每完成一组即截图校验，最后补齐状态矩阵、业务流程图和全文件视觉一致性检查。

**Tech Stack:** Figma Plugin API、Figma Variables、Auto Layout、Components/Variants、375 px 移动端画板、PingFang SC、YOYO IP 位图素材。

## Global Constraints

- 设计基准画板宽度为 375 px，页面高度根据业务内容自适应。
- 核心色固定为曜石黑 `#151515`、纯白 `#FFFFFF`、YOYO 蓝 `#6FA8FF`、腮红粉 `#FFD6E0`、中性浅灰 `#F5F5F5`。
- 页面以白色为基础；左上 YOYO 蓝柔光透明度 12%–20%，右上腮红粉柔光透明度 14%–22%。
- 登录、入驻、等待确认、空状态和个人中心使用完整柔光背景；高信息密度页面仅在页头使用。
- 大卡圆角 24 px，普通卡圆角 16–18 px，标签使用胶囊形。
- 每张卡片四角最多出现 1–2 颗星星，星星不得覆盖正文、状态标签或点击区域。
- YOYO 大形象仅用于登录、首页问候、空状态、完成反馈和等待确认；普通业务卡不重复堆叠 IP。
- 所有容器优先使用 Auto Layout，禁止依靠大面积绝对定位组织正文。
- 每个业务页面完成后必须生成截图并检查文字裁切、重叠、间距、状态层级和底部安全区。

---

### Task 1: 创建 Figma 文件与页面骨架

**Artifacts:**
- Create Figma file: `YOYO 主播中心 · 全页面 UI`
- Create pages: `00 Cover & Flow`, `01 Foundations`, `02 Components`, `03 Login & Activation`, `04 Activities & Submission`, `05 Records`, `06 Training & Onboarding`, `07 Mine`, `08 States & Edge Cases`
- Record locally: Figma `fileKey`, page node IDs, top-level frame node IDs

**Interfaces:**
- Consumes: 已确认设计规格 `docs/superpowers/specs/2026-07-27-anchor-miniapp-yoyo-ui-design.md`
- Produces: 后续任务使用的 Figma `fileKey` 与 9 个 page node ID

- [ ] **Step 1: 创建新 Figma 文件**

使用 Figma `create_new_file` 创建 `YOYO 主播中心 · 全页面 UI`，保存返回的 `fileKey` 和文件 URL。

- [ ] **Step 2: 建立 9 个页面**

使用 Figma Plugin API 创建并命名 9 个页面，顺序必须与 Artifacts 列表一致。

- [ ] **Step 3: 在每个页面建立说明区**

每个页面左上建立 Auto Layout 说明区，包含页面编号、名称和一句用途说明；业务画板从说明区下方 120 px 开始排列。

- [ ] **Step 4: 验证文件结构**

读取文件页面元数据，确认页面数量为 9、命名完全一致、没有多余未命名页面。

- [ ] **Step 5: 保存任务记录**

将 `fileKey`、文件 URL 与 page node ID 记录到计划执行日志，供后续任务直接使用。

### Task 2: 建立 Foundations 设计基础

**Artifacts:**
- Figma page: `01 Foundations`
- Create variable collection: `YOYO Core`
- Create text styles: `Display/32`, `Title/28`, `Heading/20`, `Card/17`, `Body/15`, `Label/13`, `Caption/12`
- Create effect styles: `Shadow/Card`, `Shadow/Floating`, `Glow/Blue`, `Glow/Pink`

**Interfaces:**
- Consumes: Task 1 的 `fileKey` 和 Foundations page node ID
- Produces: 颜色变量、间距变量、圆角变量、字体样式和效果样式 ID

- [ ] **Step 1: 创建核心颜色变量**

创建 `Color/Ink = #151515`、`Color/White = #FFFFFF`、`Color/BrandBlue = #6FA8FF`、`Color/Blush = #FFD6E0`、`Color/Surface = #F5F5F5`、`Color/MutedText = #747474`。

- [ ] **Step 2: 创建柔光变量**

创建 `Color/BlueGlow` 与 `Color/PinkGlow`，分别用于 16% YOYO 蓝和 18% 腮红粉的渐变端点。

- [ ] **Step 3: 创建间距和圆角变量**

创建 `Space/4`, `Space/8`, `Space/12`, `Space/16`, `Space/20`, `Space/24`, `Space/32`；创建 `Radius/12`, `Radius/16`, `Radius/18`, `Radius/24`, `Radius/Pill`。

- [ ] **Step 4: 创建文字样式**

确认 Figma 中可用的 PingFang SC 字体样式，加载对应字体后创建 7 个文字样式；正文行高为 1.45–1.6，标题行高为 1.1–1.25。

- [ ] **Step 5: 创建阴影与柔光样式**

`Shadow/Card` 使用轻微下投影，`Shadow/Floating` 用于悬浮导航和 IP 卡片；`Glow/Blue` 与 `Glow/Pink` 使用低透明度大模糊。

- [ ] **Step 6: 建立可视化色板与排版样张**

在 Foundations 页面展示每个颜色、字体、圆角、阴影与柔光背景示例，并标注名称和使用范围。

- [ ] **Step 7: 截图验证 Foundations**

生成 Foundations 页面截图，确认文字无裁切、颜色变量名称正确、蓝粉柔光不会降低黑色正文对比度。

### Task 3: 建立可复用组件库

**Artifacts:**
- Figma page: `02 Components`
- Components: `Button`, `Status Tag`, `Filter Pill`, `Tab Bar`, `Top Bar`, `YOYO Guide Card`, `Activity Card`, `Course Card`, `Record Card`, `Form Field`, `Upload Tile`, `Reward Preview`, `State Block`, `Bottom Sheet`

**Interfaces:**
- Consumes: Task 2 的变量与样式 ID
- Produces: 后续页面使用的 component key、component set key 与文本属性名

- [ ] **Step 1: 创建按钮组件集**

建立 `Button` 组件集，变体包含 `Primary`, `Secondary`, `Dark`, `Danger`, `Disabled`，尺寸包含 `Large`, `Medium`, `Small`；主按钮绑定 YOYO 蓝变量。

- [ ] **Step 2: 创建状态与筛选组件**

建立 `Status Tag`、`Filter Pill` 组件集，包含默认、选中、成功、提醒、错误、禁用状态；腮红粉只用于温柔提醒和奖励反馈。

- [ ] **Step 3: 创建导航组件**

建立 `Top Bar` 与 `Tab Bar`；Tab Bar 包含活动、培训、记录、我的四项及 4 个当前项变体。

- [ ] **Step 4: 创建 YOYO Guide Card**

建立带标题、描述、操作按钮、YOYO 半身图、蓝粉柔光和 1–2 颗角落星星的组件；提供 `Dark`, `Soft`, `Empty`, `Success` 变体。

- [ ] **Step 5: 创建业务卡组件**

分别建立 `Activity Card`, `Course Card`, `Record Card`，暴露标题、描述、状态、元数据、主操作和次操作文本属性。

- [ ] **Step 6: 创建表单组件**

建立 `Form Field`, `Upload Tile`, `Reward Preview`，包含默认、聚焦、错误、禁用、上传中、已有图片状态。

- [ ] **Step 7: 创建状态与浮层组件**

建立 `State Block` 的加载、空、错误、成功变体；建立 `Bottom Sheet` 的确认、驳回、培训清单变体。

- [ ] **Step 8: 验证组件属性**

为每个组件创建临时实例，读取 component properties，确认文本属性、布尔属性和变体名称能够由后续页面稳定覆盖。

- [ ] **Step 9: 截图验证组件库**

截图检查组件对齐、Auto Layout、文字长度适配、星星角标位置和不同状态的可辨识度。

### Task 4: 设计登录、资料完善与等待确认

**Artifacts:**
- Figma page: `03 Login & Activation`
- Frames: `Login/Welcome`, `Login/Loading`, `Login/Error`, `Activation/New`, `Activation/Legacy`, `Activation/Uploading`, `Activation/Pending Confirmation`

**Interfaces:**
- Consumes: Task 3 的按钮、表单、YOYO Guide Card、State Block
- Produces: 登录与入驻流程画板 node ID

- [ ] **Step 1: 创建登录欢迎页**

建立 375 px 画板，使用完整蓝粉柔光背景、大尺寸 YOYO、白色线稿星星/兔耳、企业微信登录按钮和隐私说明。

- [ ] **Step 2: 创建登录过程状态**

复制欢迎页并制作检查登录态、登录中、路由中和失败状态；失败状态使用 State Block 与重新登录按钮。

- [ ] **Step 3: 创建新主播资料页**

加入步骤提示、头像上传、企微头像按钮、昵称与 UID、手机号、锁定运营老师和提交资料按钮。

- [ ] **Step 4: 创建老主播资料页**

将运营老师区替换为选择器，并增加运营列表为空与手机号错误的字段状态展示。

- [ ] **Step 5: 创建上传与提交状态**

展示头像上传中、提交中、按钮禁用和字段校验反馈。

- [ ] **Step 6: 创建等待运营确认页**

使用 YOYO 大形象、完整柔光背景、负责运营信息、刷新状态和退出登录操作。

- [ ] **Step 7: 截图验证流程**

分别截图登录欢迎、新主播资料和等待确认，检查背景柔光、IP 构图、键盘安全区和长文本换行。

### Task 5: 设计活动首页与单活动记录

**Artifacts:**
- Figma page: `04 Activities & Submission`
- Frames: `Activities/Ongoing`, `Activities/Pending Operator`, `Activities/Upcoming`, `Activities/Ended`, `Activities/Empty`, `Activities/Error`, `Activity Records/List`, `Activity Records/Empty`, `Activity Records/Error`

**Interfaces:**
- Consumes: Task 3 的 Tab Bar、YOYO Guide Card、Activity Card、Record Card、Filter Pill、State Block
- Produces: 活动浏览和单活动记录画板 node ID

- [ ] **Step 1: 创建进行中活动首页**

使用顶部蓝粉柔光、问候、YOYO 今日重点卡、筛选胶囊和至少 2 张进行中活动卡。

- [ ] **Step 2: 创建运营待确认状态**

在活动列表上方加入归属待确认提示，活动卡的提报按钮进入禁用态，保留查看记录。

- [ ] **Step 3: 创建未开始与已结束状态**

展示倒计时、未开始按钮和历史记录入口；已结束卡仅保留查看记录。

- [ ] **Step 4: 创建空与错误状态**

使用 State Block，空状态加入 YOYO 小形象和星星；错误状态提供重试。

- [ ] **Step 5: 创建单活动记录列表**

展示活动封面页头、审核状态、发放状态、直播时间、运营老师、奖励摘要和查看/修改操作。

- [ ] **Step 6: 创建单活动记录空与错误状态**

分别展示无记录、参数缺失和加载失败。

- [ ] **Step 7: 截图验证活动组**

截图进行中、待确认和活动记录列表，检查卡片信息密度、按钮层级和底部导航安全区。

### Task 6: 设计活动提报与修改流程

**Artifacts:**
- Figma page: `04 Activities & Submission`
- Frames: `Submit/Gift Step 1`, `Submit/Gift Step 2`, `Submit/Gift Step 3`, `Submit/PK`, `Submit/Reward Hit`, `Submit/No Reward`, `Submit/Uploading`, `Submit/Edit Rejected`, `Submit/Locked`, `Submit/Error`

**Interfaces:**
- Consumes: Task 3 的 Form Field、Upload Tile、Reward Preview、Button、State Block
- Produces: 提报流程画板 node ID

- [ ] **Step 1: 创建礼物活动分步提报**

建立直播信息、活动数据、截图凭证三个 375 px 画板，顶部保留步骤指示和活动摘要。

- [ ] **Step 2: 创建礼物条目输入**

展示礼物类型、数量、增加条目、删除条目以及每日累计说明。

- [ ] **Step 3: 创建 PK 活动提报**

将礼物条目替换为 PK 值输入和奖励档位列表。

- [ ] **Step 4: 创建奖励预览状态**

分别展示预览中、命中奖励和未命中奖励；命中奖励使用腮红粉星星与 YOYO 成功反馈，不将粉色用作主提交按钮。

- [ ] **Step 5: 创建截图上传状态**

展示空上传格、已有图片、上传中、删除与最多 9 张限制。

- [ ] **Step 6: 创建驳回修改模式**

展示驳回原因、已存在附件、修改后重新提交操作。

- [ ] **Step 7: 创建锁定与错误状态**

包含已审核、已发放不可修改、运营归属未确认和页面加载失败。

- [ ] **Step 8: 截图验证提报流程**

截图礼物 Step 2、PK 提报、奖励命中和驳回修改，检查输入层级、操作顺序和长页面滚动布局。

### Task 7: 设计全部记录与记录详情

**Artifacts:**
- Figma page: `05 Records`
- Frames: `Records/All`, `Records/Pending`, `Records/Approved`, `Records/Rejected`, `Records/Empty`, `Records/Error`, `Record Detail/Pending`, `Record Detail/Approved`, `Record Detail/Rejected`, `Record Detail/Granted`

**Interfaces:**
- Consumes: Task 3 的 Record Card、Status Tag、Filter Pill、State Block、Button
- Produces: 记录列表和详情画板 node ID

- [ ] **Step 1: 创建全部记录列表**

展示筛选胶囊、礼物活动与 PK 活动记录、审核状态、发放状态、直播时间和奖励摘要。

- [ ] **Step 2: 创建筛选状态**

制作审核中、已通过、已驳回三种筛选结果画板。

- [ ] **Step 3: 创建空与错误状态**

空状态使用 YOYO 小形象，错误状态包含重新加载操作。

- [ ] **Step 4: 创建审核中详情**

展示活动、直播信息、礼物明细或 PK 值、奖励预览和截图凭证。

- [ ] **Step 5: 创建通过与已发放详情**

通过状态展示审核通过；已发放状态强化奖励到账，并移除修改入口。

- [ ] **Step 6: 创建驳回详情**

突出驳回原因，保留修改记录按钮，使用腮红粉作为提醒点缀。

- [ ] **Step 7: 截图验证记录组**

截图全部记录、驳回详情和已发放详情，确认状态差异明确且没有依赖额外高饱和颜色。

### Task 8: 设计培训中心与岗前确认

**Artifacts:**
- Figma page: `06 Training & Onboarding`
- Frames: `Training/Sessions`, `Training/Registered`, `Training/Waitlist`, `Training/Progress`, `Training/Recommendations`, `Training/Empty`, `Training/Error`, `Onboarding/Pending`, `Onboarding/All Nodes`, `Onboarding/Confirm Sheet`, `Onboarding/Reject Sheet`, `Onboarding/Empty`, `Onboarding/Error`

**Interfaces:**
- Consumes: Task 3 的 Course Card、Status Tag、Button、Bottom Sheet、State Block、YOYO Guide Card
- Produces: 培训与岗前流程画板 node ID

- [ ] **Step 1: 创建开放课表**

展示课程序号、老师、时间、余位、候补、会议号和报名按钮，顶部使用星图成长摘要。

- [ ] **Step 2: 创建已报名与候补状态**

展示首学/复习/补学标签、复制入会链接和取消报名操作。

- [ ] **Step 3: 创建我的进度**

用星轨展示未开始、已报名、已学习、待补学、补学排队和已补学。

- [ ] **Step 4: 创建推荐课程**

展示系统、运营老师和培训老师三种来源及推荐原因。

- [ ] **Step 5: 创建培训空与错误状态**

分别覆盖无开放场次、无推荐课程和数据加载失败。

- [ ] **Step 6: 创建岗前待确认页**

展示完成数、下一节点、待确认卡片和 7 个节点进度星轨。

- [ ] **Step 7: 创建确认与驳回抽屉**

确认抽屉展示证据信息与培训清单；驳回抽屉包含必填原因、取消、驳回和确认通过。

- [ ] **Step 8: 创建岗前空与错误状态**

展示暂无待确认事项和加载失败。

- [ ] **Step 9: 截图验证培训与岗前**

截图开放课表、我的进度、岗前待确认和确认抽屉，检查星轨、标签密度和浮层安全区。

### Task 9: 设计个人中心与跨页面边界状态

**Artifacts:**
- Figma pages: `07 Mine`, `08 States & Edge Cases`
- Frames: `Mine/Todos`, `Mine/No Todos`, `Mine/Preview`, `Mine/Missing Profile`, `Mine/Login Lost`, `Mine/Error`, `State/Loading`, `State/Empty`, `State/Error`, `State/Success`, `State/Toast`, `State/Modal`, `State/Long Text`

**Interfaces:**
- Consumes: Task 3 全部状态组件和 Task 4–8 已建立的业务模式
- Produces: 个人中心和全局边界状态画板 node ID

- [ ] **Step 1: 创建有待办的个人中心**

使用完整蓝粉柔光背景、主播档案、YOYO 待办助手、岗前/培训/活动待办和常用入口。

- [ ] **Step 2: 创建无待办与预览模式**

无待办状态展示 YOYO 轻松反馈；预览模式明确显示模拟数据标记。

- [ ] **Step 3: 创建资料缺失与登录丢失**

分别提供完善资料和重新登录主操作。

- [ ] **Step 4: 创建个人中心错误状态**

展示档案加载失败和重试。

- [ ] **Step 5: 建立全局状态矩阵**

集中展示 Loading、Empty、Error、Success、Toast、Modal、超长中文标题、超长运营姓名、长驳回原因和 9 张上传图片。

- [ ] **Step 6: 截图验证个人中心与边界状态**

截图有待办、无待办和长文本矩阵，确认柔光背景、IP 使用量和文本适配。

### Task 10: 创建封面、业务流程与最终 QA

**Artifacts:**
- Figma page: `00 Cover & Flow`
- Frames: `Cover`, `User Journey`, `Page Inventory`, `Handoff Notes`
- Final delivery: Figma URL and QA summary

**Interfaces:**
- Consumes: Task 1–9 的全部页面和 node ID
- Produces: 可导航、可审阅、可交付的最终 Figma 文件

- [ ] **Step 1: 创建封面**

封面包含 YOYO 大形象、项目名称、设计日期、核心色和“主播角色全页面 UI”说明。

- [ ] **Step 2: 创建用户旅程**

绘制登录 → 资料完善 → 运营确认 → 活动/培训/记录/我的，以及活动 → 提报 → 审核 → 发放的两条核心流程。

- [ ] **Step 3: 创建页面清单**

列出 10 个路由、对应 Figma 页面、主画板名称和状态画板数量。

- [ ] **Step 4: 建立原型连线**

为登录、入驻、活动提报、记录详情、培训报名和岗前确认添加主要原型跳转。

- [ ] **Step 5: 执行逐页截图 QA**

对 9 个 Figma 页面和至少 10 个主业务画板生成截图，检查文字裁切、重叠、滚动内容、状态一致性、组件脱离和底部安全区。

- [ ] **Step 6: 修正 QA 问题**

逐项修正截图中发现的问题，并重新生成对应截图，直到问题不再出现。

- [ ] **Step 7: 验证最终覆盖率**

确认 10 个路由均有主场景，登录/加载/失败/空/待确认/驳回/报名/候补/已审核/已发放等关键状态均有画面或组件变体。

- [ ] **Step 8: 交付**

返回 Figma 文件 URL、页面数量、主画板数量、关键组件数量和 QA 结果摘要。
