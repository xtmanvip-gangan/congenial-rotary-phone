# 阶段 E：看板、加固与上线实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有礼物与培训闭环上补齐角色看板、任务运行监控、外部接口异常处理、安全边界和可回退上线工具，使系统具备内部正式试运行条件。

**Architecture:** 看板直接聚合现有业务表，不复制统计主数据；任务执行统一经过 `JobRunService` 留下幂等键、状态、计数、耗时和错误；腾讯会议与企微故障统一写入 `IntegrationIncident`，管理员可确认和关闭。上线工具全部默认只读或预览，数据库清理必须先生成预览令牌，不能由部署脚本无条件清空数据。

**Tech Stack:** NestJS 11、Prisma 6、PostgreSQL、Vitest、React 19、TanStack Query、Taro、Shell。

---

## 边界与文件职责

- `api/src/modules/dashboard/`：按当前登录角色聚合审核、运营、培训和超管指标。
- `api/src/modules/operations/job-run.service.ts`：任务运行状态、幂等占用、成功/失败收尾。
- `api/src/modules/operations/incidents.service.ts`：外部接口异常归并、查询、重试入口和人工关闭。
- `api/src/modules/operations/maintenance.service.ts`：测试数据清理预览；本阶段不在 API 中直接执行物理删除。
- `api/src/modules/audit/`：跨模块敏感操作的统一审计查询和写入。
- `src/pages/StaffHomePage.tsx`：审核、运营、培训老师按角色显示行动看板。
- `src/pages/AdminDashboardPage.tsx`：超管跨礼物与培训总览。
- `src/pages/OperationsCenterPage.tsx`：任务运行、外部异常和上线前检查。
- `scripts/` 与 `docs/deployment/`：备份、预检、部署、回退和演练说明。

### Task 1：运行监控、异常与审计数据模型

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `migrations/202607230005_add_operations_monitoring.sql`
- Create: `api/src/modules/operations/job-run.service.spec.ts`
- Create: `api/src/modules/operations/job-run.service.ts`

- [ ] **Step 1: Write the failing tests**

测试同一 `jobCode + idempotencyKey` 只能开始一次、运行成功保存统计、异常保存安全错误摘要且不泄露密钥。

- [ ] **Step 2: Run tests and verify failure**

Run: `npm --prefix api test -- job-run.service.spec.ts`
Expected: FAIL，因为服务和 Prisma 模型尚不存在。

- [ ] **Step 3: Add minimal schema and service**

新增 `SystemJobRun`、`IntegrationIncident`、`SystemAuditLog` 及状态枚举。任务表保存任务编码、幂等键、状态、尝试次数、开始/结束时间、扫描/成功/失败数量和最后错误；异常表使用稳定 `dedupeKey` 归并重复故障；审计表保存操作人、角色、登录方式、对象、前后值、原因和请求追踪 ID。

- [ ] **Step 4: Generate client and verify**

Run: `npm --prefix api run prisma:generate && npm --prefix api test -- job-run.service.spec.ts && npm --prefix api run lint`
Expected: PASS。

- [ ] **Step 5: Commit**

Run: `git add api/prisma/schema.prisma migrations/202607230005_add_operations_monitoring.sql api/src/modules/operations && git commit -m "feat: add operations monitoring foundation"`

### Task 2：各角色看板聚合接口

**Files:**
- Create: `api/src/modules/dashboard/dashboard.service.spec.ts`
- Create: `api/src/modules/dashboard/dashboard.service.ts`
- Create: `api/src/modules/dashboard/dashboard.controller.ts`
- Create: `api/src/modules/dashboard/dashboard.module.ts`
- Modify: `api/src/app.module.ts`

- [ ] **Step 1: Write failing role-scope tests**

覆盖审核老师的激活漏斗、运营仅本人主播的岗前/首播/培训待办、培训人员的报名/参会/反馈/问题/异常、超管的礼物与培训总览；断言运营查询条件始终包含当前运营 ID。

- [ ] **Step 2: Verify failure**

Run: `npm --prefix api test -- dashboard.service.spec.ts`
Expected: FAIL，因为聚合服务尚不存在。

- [ ] **Step 3: Implement role-aware aggregation**

提供 `GET /api/dashboard`，响应包含 `role`、`generatedAt`、`metrics`、`attentionItems`。比率分母为零时返回 `0`，时间统一返回 ISO 字符串；后端依据会话角色选择查询，不接受客户端传入运营 ID。

- [ ] **Step 4: Verify**

Run: `npm --prefix api test -- dashboard.service.spec.ts && npm --prefix api run lint`
Expected: PASS。

- [ ] **Step 5: Commit**

Run: `git add api/src/modules/dashboard api/src/app.module.ts && git commit -m "feat: add role-aware operations dashboards"`

### Task 3：任务运行记录和幂等执行

**Files:**
- Modify: `api/src/modules/jobs/training-jobs.service.spec.ts`
- Modify: `api/src/modules/jobs/training-jobs.service.ts`
- Modify: `api/src/modules/jobs/training-jobs.controller.ts`
- Create: `api/src/modules/operations/operations.controller.ts`
- Create: `api/src/modules/operations/operations.module.ts`
- Modify: `api/src/app.module.ts`

- [ ] **Step 1: Write failing monitoring tests**

覆盖一小时提醒和通知重试的运行记录、重复调度返回既有结果、部分失败计数、任务列表仅培训管理员/密码超管可见。

- [ ] **Step 2: Verify failure**

Run: `npm --prefix api test -- training-jobs.service.spec.ts job-run.service.spec.ts`
Expected: FAIL，现有任务没有可靠运行记录。

- [ ] **Step 3: Route jobs through JobRunService**

由服务端按任务类型和时间窗口生成幂等键；任务运行状态使用 `running/succeeded/failed/partial`，失败后保留可重试记录。新增任务运行列表和单次受控重试接口，不提供任意任务名执行能力。

- [ ] **Step 4: Verify**

Run: `npm --prefix api test -- training-jobs.service.spec.ts job-run.service.spec.ts && npm --prefix api run lint`
Expected: PASS。

- [ ] **Step 5: Commit**

Run: `git add api/src/modules/jobs api/src/modules/operations api/src/app.module.ts && git commit -m "feat: monitor idempotent training jobs"`

### Task 4：外部接口异常中心

**Files:**
- Create: `api/src/modules/operations/incidents.service.spec.ts`
- Create: `api/src/modules/operations/incidents.service.ts`
- Modify: `api/src/modules/operations/operations.controller.ts`
- Modify: `api/src/modules/notifications/notifications.service.ts`
- Modify: `api/src/modules/training/training-meetings.service.ts`

- [ ] **Step 1: Write failing incident tests**

覆盖企微通知和腾讯会议失败按稳定键归并、重复失败增加次数、只保存脱敏错误、人工关闭记录操作者、失败重试成功后自动恢复。

- [ ] **Step 2: Verify failure**

Run: `npm --prefix api test -- incidents.service.spec.ts notifications.service.spec.ts training-meetings.service.spec.ts`
Expected: FAIL。

- [ ] **Step 3: Implement incident lifecycle**

外部适配调用失败写入 `open` 异常，成功重试将其标记 `recovered`；管理员可以增加处理备注并关闭。列表支持按来源、状态和严重度过滤，任何响应均不包含请求密钥或完整外部响应。

- [ ] **Step 4: Verify**

Run: `npm --prefix api test -- incidents.service.spec.ts notifications.service.spec.ts training-meetings.service.spec.ts && npm --prefix api run lint`
Expected: PASS。

- [ ] **Step 5: Commit**

Run: `git add api/src/modules/operations api/src/modules/notifications api/src/modules/training && git commit -m "feat: add integration incident center"`

### Task 5：Web 看板和运维中心

**Files:**
- Modify: `src/pages/StaffHomePage.tsx`
- Modify: `src/pages/AdminDashboardPage.tsx`
- Create: `src/pages/OperationsCenterPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/lib/api.ts`
- Modify: `src/index.css`

- [ ] **Step 1: Add typed API contracts and render tests through TypeScript**

定义统一看板、任务运行和异常对象；页面只消费后端已限定角色的数据，不在前端重新拼接全量业务记录。

- [ ] **Step 2: Build role workspaces**

审核老师看到激活漏斗；运营看到岗前、首播、缺席补学、反馈和礼物待办；培训人员看到课程执行、参会、问题和异常；超管看到跨模块总览。

- [ ] **Step 3: Build operations center**

展示最近任务状态、耗时、计数、最后错误和重试按钮；展示开放异常、发生次数、最近时间、处理备注和关闭操作。只有培训管理员和超管显示入口。

- [ ] **Step 4: Verify**

Run: `npm run build`
Expected: TypeScript 和 Vite build PASS。

- [ ] **Step 5: Commit**

Run: `git add src && git commit -m "feat: add dashboard and operations center views"`

### Task 6：安全、权限、并发和上传加固

**Files:**
- Create: `api/src/common/security/security-headers.middleware.ts`
- Create: `api/src/common/security/login-rate-limiter.service.ts`
- Create: `api/src/common/security/login-rate-limiter.service.spec.ts`
- Modify: `api/src/main.ts`
- Modify: `api/src/modules/auth/auth.controller.ts`
- Modify: `api/src/modules/auth/auth.service.spec.ts`
- Modify: `api/src/modules/training/training-attendance-import.service.spec.ts`
- Modify: `api/src/modules/training/training-attendance-import.service.ts`

- [ ] **Step 1: Write failing security tests**

覆盖超管密码登录连续失败限流、成功后清除失败计数、企微/小程序登录不接受密码入口、Excel 文件扩展名与 MIME/ZIP 签名字节不一致时拒绝、同一场次重复导入幂等。

- [ ] **Step 2: Verify failure**

Run: `npm --prefix api test -- login-rate-limiter.service.spec.ts auth.service.spec.ts training-attendance-import.service.spec.ts`
Expected: FAIL。

- [ ] **Step 3: Implement minimal hardening**

增加安全响应头、环境化 CORS 白名单、生产环境上传目录不可直接执行、超管登录按用户名与来源地址限流、错误信息不区分账号是否存在；Excel 同时检查扩展名、MIME 和 ZIP 文件签名。

- [ ] **Step 4: Run focused and full security tests**

Run: `npm --prefix api test && npm --prefix api run lint && npm audit --prefix api --omit=dev`
Expected: PASS，生产依赖漏洞为 0。

- [ ] **Step 5: Commit**

Run: `git add api/src api/package-lock.json && git commit -m "fix: harden authentication uploads and access boundaries"`

### Task 7：测试数据清理预览与上线工具

**Files:**
- Create: `api/src/modules/operations/maintenance.service.spec.ts`
- Create: `api/src/modules/operations/maintenance.service.ts`
- Modify: `api/src/modules/operations/operations.controller.ts`
- Create: `scripts/preflight.sh`
- Create: `scripts/backup-postgres.sh`
- Create: `scripts/restore-postgres.sh`
- Create: `scripts/cleanup-test-data.sql`
- Create: `docs/deployment/phase-e-launch-runbook.md`
- Modify: `README.md`
- Modify: `api/.env.example`

- [ ] **Step 1: Write failing cleanup preview tests**

测试预览只统计测试主播、提报、审核、奖励和通知；不统计活动规则及真实员工；未提供显式环境和预览令牌时禁止执行。

- [ ] **Step 2: Verify failure**

Run: `npm --prefix api test -- maintenance.service.spec.ts`
Expected: FAIL。

- [ ] **Step 3: Implement preview-only API and guarded scripts**

API 只提供清理预览与清单导出。SQL 清理模板要求事务、显式环境变量、预览令牌和人工取消注释才能执行；备份/恢复脚本拒绝空数据库地址与宽泛目录，恢复必须指向明确备份文件。

- [ ] **Step 4: Document rehearsal**

运行手册写明配置校验、备份、迁移、冒烟、任务调度、异常观察、回退触发条件和恢复验证；不写真实凭证。

- [ ] **Step 5: Verify scripts safely**

Run: `bash -n scripts/preflight.sh scripts/backup-postgres.sh scripts/restore-postgres.sh`
Expected: 语法检查 PASS；不连接数据库。

- [ ] **Step 6: Commit**

Run: `git add api/src/modules/operations scripts docs/deployment README.md api/.env.example && git commit -m "docs: add guarded launch and rollback tooling"`

### Task 8：全量验收

**Files:**
- Modify: `docs/superpowers/plans/2026-07-23-phase-e-dashboard-hardening-launch.md`

- [ ] **Step 1: Validate database schema**

Run: `npm --prefix api run prisma:generate && cd api && npx prisma validate`
Expected: PASS，不连接生产数据库。

- [ ] **Step 2: Verify API**

Run: `npm --prefix api run lint && npm --prefix api test && npm --prefix api run build && npm audit --prefix api --omit=dev`
Expected: 全部 PASS，生产依赖漏洞为 0。

- [ ] **Step 3: Verify Web and miniapp**

Run: `npm run build && npm --prefix miniapp-anchor run build:weapp`
Expected: PASS。

- [ ] **Step 4: Verify repository scope**

Run: `git status --short && git diff --check`
Expected: 只包含副本项目阶段 E 的预期变更，无空白错误。

- [ ] **Step 5: Record results and commit**

在本计划末尾记录测试数量、构建结果、未连接真实外部系统/生产数据库和上线前人工事项，然后提交文档。

---

## 明确不纳入本阶段

- 不引入独立消息队列、Prometheus 或第三方告警平台。
- 不做考试、评分、排名或自动淘汰。
- 不上传或在线播放培训视频。
- 不自动物理删除现有业务记录。
- 不在本地执行生产迁移、真实企微通知或腾讯会议调用。
