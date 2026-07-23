# 阶段 D：外部集成与运营闭环实施计划

> **执行要求：** 按 `superpowers:executing-plans` 分任务实施；每个行为先写失败测试，再写最小实现，并在宣称完成前执行 `superpowers:verification-before-completion`。

**目标：** 在阶段 C 培训核心之上，完成腾讯会议创建和参会同步、Excel 备用导入、通用企业微信通知、课程推荐、运营应用反馈、问题池和周沟通会，使课程结束后能够形成可追溯的参会与学习记录。

**架构：** 外部系统统一放入适配层，业务服务不直接拼接腾讯会议或企业微信请求。会议接口和 Excel 导入都先写不可变原始记录，再由同一套参会归并服务匹配本场报名名单、累计时长并生成结论。通用通知服务兼容原礼物通知，通过业务类型、业务 ID 和幂等键关联。推荐、反馈和问题池共用现有主播档案、固定运营归属、课程与场次，不复制主数据。

**技术栈：** NestJS 11、Prisma 6、PostgreSQL、Vitest、React 19、Taro、腾讯会议 REST API 企业自建应用鉴权、企业微信自建应用消息、ExcelJS。

---

## 外部接口边界

- 腾讯会议企业自建应用使用 `X-TC-Key`、`X-TC-Timestamp`、`X-TC-Nonce`、`X-TC-Signature`、`AppId`、可选 `SdkId` 和 `X-TC-Registered: 1`。
- 签名只在 `TencentMeetingClient` 内生成；SecretId、SecretKey、AppId、SdkId 和固定会议创建人 userid 只从环境变量读取。
- 创建会议使用 `POST /v1/meetings`，创建人是培训中心固定账号；每个培训场次最多关联一个外部会议。
- 参会成员使用 `GET /v1/meetings/{meetingId}/participants` 分页读取，保存每次进入与退出明细；返回的 Base64 名称在适配层解码。
- 企业微信消息仍通过现有 `WecomService` 发送；培训业务只能调用通用通知服务，不直接调用企微 HTTP API。
- 缺少密钥时不调用真实外部接口，并返回明确的“未配置”错误；测试使用适配器替身。

### 任务 1：阶段 D 数据模型和迁移

**文件：**

- 修改：`api/prisma/schema.prisma`
- 新增：`migrations/202607230004_add_training_integrations.sql`
- 修改：`api/src/modules/notifications/notifications.service.ts`
- 测试：`api/src/modules/notifications/notifications.service.spec.ts`

**步骤：**

1. 为会议创建状态、参会来源、匹配状态、参会结论、推荐来源、应用反馈状态、问题状态和问题处理类型增加枚举。
2. 新增 `TrainingMeeting`、`TrainingAttendanceImport`、`TrainingAttendanceRawRecord`、`TrainingAttendanceRecord`、`TrainingAttendanceAuditLog`。
3. 新增 `TrainingCourseRecommendation`、`TrainingApplicationFeedback`、`TrainingQuestion`、`TrainingQuestionAction`、`TrainingWeeklyMeeting`、`TrainingWeeklyAction`。
4. 将 `NotificationLog.submissionId` 改为可空，增加 `businessType`、`businessId`、`templateCode`、`dedupeKey`、`attemptCount`、`maxAttempts`、`scheduledAt`、`lastAttemptAt`。
5. 保留现有 Submission 关系和礼物通知行为；补充通用通知写入的失败测试和实现。
6. 生成 Prisma Client，执行 `prisma validate`、通知单测、API 类型检查。

### 任务 2：腾讯会议签名和 HTTP 适配器

**文件：**

- 新增：`api/src/modules/integrations/tencent-meeting/tencent-meeting.types.ts`
- 新增：`api/src/modules/integrations/tencent-meeting/tencent-meeting.client.ts`
- 新增：`api/src/modules/integrations/tencent-meeting/tencent-meeting.client.spec.ts`
- 新增：`api/src/modules/integrations/tencent-meeting/tencent-meeting.module.ts`
- 修改：`api/src/app.module.ts`
- 修改：`api/.env.example`

**步骤：**

1. 测试固定时间戳、nonce、请求 URI 和 JSON 请求体可得到确定签名。
2. 实现企业自建应用签名、公共请求头、错误规范化和超时。
3. 实现创建会议、修改会议、取消会议、分页获取参会成员。
4. 测试参会人 Base64 名称解码、分页合并和接口错误不泄露密钥。
5. 在 `.env.example` 只增加变量名和说明，不写真实凭证。

### 任务 3：场次发布与腾讯会议生命周期

**文件：**

- 新增：`api/src/modules/training/training-meetings.service.ts`
- 新增：`api/src/modules/training/training-meetings.service.spec.ts`
- 修改：`api/src/modules/training/training.service.ts`
- 修改：`api/src/modules/training/training.module.ts`
- 修改：`api/src/modules/training/training.controller.ts`

**步骤：**

1. 测试发布草稿时创建会议并保存会议 ID、会议号、入会链接和响应摘要。
2. 测试创建失败时场次为 `publish_failed`，不暴露无效入会链接，可安全重试。
3. 测试重复发布或重复重试不创建第二个会议。
4. 改期时同步修改外部会议；取消时同步取消外部会议，并通知已报名主播。
5. 场次接口返回会议创建状态、可用入会链接和最近同步时间。

### 任务 4：参会同步、名单匹配和人工确认

**文件：**

- 新增：`api/src/modules/training/training-attendance.service.ts`
- 新增：`api/src/modules/training/training-attendance.service.spec.ts`
- 新增：`api/src/modules/training/dto/resolve-attendance.dto.ts`
- 修改：`api/src/modules/training/training.controller.ts`
- 修改：`api/src/modules/training/training.service.ts`

**步骤：**

1. 先测稳定企微 UID 匹配、场次内企微名称唯一匹配、同名冲突和无法匹配。
2. 测试同一参会人多段进出累计时长，重叠区间合并，避免重复计算。
3. 测试累计时长达到计划课程时长 80% 自动把报名和课程进度标记为 `learned`。
4. 测试低于 80%、冲突和未匹配保持待确认，不自动误判。
5. 保存原始 JSON、区间、累计时长、比例、自动匹配依据和同步批次。
6. 提供同步、查看预览、人工绑定主播、人工确认结论接口；人工动作写审计日志且不覆盖原始数据。
7. 重复同步对同一外部记录幂等。

### 任务 5：Excel 备用导入

**文件：**

- 修改：`api/package.json`
- 修改：`api/package-lock.json`
- 新增：`api/src/modules/training/training-attendance-import.service.ts`
- 新增：`api/src/modules/training/training-attendance-import.service.spec.ts`
- 修改：`api/src/modules/training/training.controller.ts`
- 修改：`api/src/modules/exports/exports.service.ts`

**步骤：**

1. 用 ExcelJS 替换存在已知安全问题且无人维护的 `xlsx`，保持现有导出格式。
2. 测试腾讯会议常见中文表头解析、Excel 日期/文本日期和参会时长解析。
3. 上传时限制 `.xlsx`、文件大小和必填列，使用文件 SHA-256 + 场次 ID 防重复。
4. 导入先保存批次和原始行，返回自动匹配、同名冲突、未匹配和无效行预览。
5. 确认后复用任务 4 的统一归并逻辑，重复确认不重复写学习记录。
6. 培训管理员和培训老师可操作；超级管理员可从外部浏览器操作；运营和主播无权导入。

### 任务 6：培训通知和幂等提醒任务

**文件：**

- 修改：`api/src/modules/notifications/notifications.service.ts`
- 修改：`api/src/modules/training/training.service.ts`
- 新增：`api/src/modules/training/training-notifications.service.ts`
- 新增：`api/src/modules/training/training-notifications.service.spec.ts`
- 新增：`api/src/modules/jobs/training-jobs.service.ts`
- 新增：`api/src/modules/jobs/training-jobs.controller.ts`
- 新增：`api/src/modules/jobs/training-jobs.module.ts`
- 修改：`api/src/app.module.ts`

**步骤：**

1. 报名成功、候补、补位、取消、改期和参会结论分别生成企微通知。
2. 开课前一小时提醒使用确定 `dedupeKey`，重复执行任务只发送一次。
3. 报名发生在开课前一小时内时立即发送包含会议入口的提醒。
4. 通知失败记录次数和错误，重试任务只拉取可重试记录；超过次数进入人工处理。
5. 提供受管理员保护的幂等任务入口，生产定时调度在阶段 E 部署配置中接入。

### 任务 7：课程推荐

**文件：**

- 新增：`api/src/modules/training/training-recommendations.service.ts`
- 新增：`api/src/modules/training/training-recommendations.service.spec.ts`
- 新增：`api/src/modules/training/dto/create-recommendation.dto.ts`
- 修改：`api/src/modules/training/training.controller.ts`
- 修改：`miniapp-anchor/src/services/training.ts`
- 修改：`miniapp-anchor/src/types/training.ts`
- 修改：`miniapp-anchor/src/pages/training/index.tsx`

**步骤：**

1. 新主播系统推荐课程 1—3；完成基础课程后推荐未完成的 4—7。
2. 运营只能为自己已确认归属主播推荐；培训人员可为任何有效主播推荐。
3. 保存来源、推荐人、原因、查看、报名和完成时间。
4. 主播打开培训页时标记已查看，报名和完成时回填推荐状态。
5. 推荐不限制主播报名其他开放课程。

### 任务 8：运营应用反馈、问题池和周沟通会

**文件：**

- 新增：`api/src/modules/training/training-operations.service.ts`
- 新增：`api/src/modules/training/training-operations.service.spec.ts`
- 新增：`api/src/modules/training/dto/training-operations.dto.ts`
- 修改：`api/src/modules/training/training.controller.ts`
- 新增：`src/pages/TrainingOperationsPage.tsx`
- 修改：`src/App.tsx`
- 修改：`src/lib/api.ts`
- 修改：`src/components/RoleWorkspaceSwitcher.tsx`

**步骤：**

1. 每周按运营和本周已学习课程幂等生成反馈待办。
2. 运营可单条或批量更新 `unobserved`、`practicing`、`applied`、`needs_support`，并填写观察、回放问题、下一门推荐和介入需求。
3. 运营可随时提交问题；只能选择自己主播，培训人员可查看全部。
4. 紧急问题即时进入待处理列表；普通问题进入每周整理池。
5. 培训中心可分类为标准课程、复习场次、周六答疑、临时专项课、新课程需求或运营跟进，并保存操作历史。
6. 周沟通会记录参会人、议题、决定、负责人、期限和完成状态。

### 任务 9：培训执行端页面

**文件：**

- 修改：`src/pages/TrainingSessionsPage.tsx`
- 新增：`src/pages/TrainingAttendancePage.tsx`
- 修改：`src/pages/OperatorTrainingPage.tsx`
- 修改：`src/App.tsx`
- 修改：`src/lib/api.ts`
- 修改：`src/index.css`

**步骤：**

1. 场次页展示会议创建状态、会议号、入会链接、重试、参会同步入口。
2. 参会页提供同步结果、Excel 上传预览、冲突/未匹配人工绑定和低于 80% 人工结论。
3. 运营页增加推荐、每周应用反馈和问题提交。
4. 培训运营页增加问题整理和周沟通会。
5. 页面不展示考试、分数或排名。

### 任务 10：文档与全量验证

**文件：**

- 修改：`README.md`
- 修改：`api/.env.example`
- 修改：本计划文件

**步骤：**

1. 记录腾讯会议和企微配置项、最小权限、接口联调方法、Excel 模板和故障回退。
2. 明确没有真实凭证时系统行为，以及生产迁移/回滚步骤。
3. 执行 API 全量测试、API lint/build、Web lint/build、Miniapp build、Prisma validate。
4. 检查工作树只包含副本项目内的预期变更。
5. 按功能边界提交小粒度 Git commit。

---

## 实施结果（2026-07-23）

- 腾讯会议企业自建应用签名、会议创建/修改/取消和参会分页适配器已完成。
- 场次发布、失败重试、会议入口、API参会同步、80%自动完成、同名冲突和人工审计已完成。
- `.xlsx` 参会表预览、文件哈希幂等、确认导入和外部浏览器超管入口已完成。
- 原 `xlsx` 已替换为 ExcelJS，生产依赖审计为0个漏洞。
- 通用企微通知日志、报名/候补/补位/取消/改期/一小时提醒/参会结论和失败重试已完成。
- 课程推荐、运营应用反馈、问题池和周沟通会的模型、接口和页面已完成。
- Web 增加参会处理与培训运营页面；主播小程序增加推荐课程页面。
- 阶段D实现没有调用真实腾讯会议、企业微信或生产数据库；真实联调需在部署环境注入密钥并先使用官方调试工具确认权限。
