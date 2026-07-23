# Phase B Onboarding and Fixed Gift Operator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development for every behavior change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通主播固定运营确认后的岗前进度、独立首播和首播复盘闭环，并让礼物提报由服务端依据主播档案自动绑定固定运营。

**Architecture:** 岗前流程以主播档案为主表，每个节点保存独立完成记录，运营只能维护自己已确认归属的主播。礼物提报继续保留现有非空运营字段以兼容测试数据和旧查询，同时新增主播档案、归属快照及归属确认状态；客户端不再提交或选择运营，服务端根据主播当前档案决定归属。待运营确认期间允许主播提交，但记录进入“归属待确认”，不进入运营审核、通知、奖励和管理统计；确认归属时统一转为可处理记录。

**Tech Stack:** React 19、TypeScript、Vite、Taro 4、NestJS 11、Prisma 6、PostgreSQL、Vitest。

---

## 1. 状态约定

### 岗前节点

```ts
export type OnboardingMilestoneType =
  | 'operator_received'
  | 'homepage_ready'
  | 'live_software_ready'
  | 'helper_software_ready'
  | 'prejob_learning_completed'
  | 'prelive_check_completed'
  | 'first_live_completed'
  | 'first_live_review_completed'
```

节点按上述顺序推进。运营可补充备注和完成时间，但不能跳过前置节点；首播完成必须在开播前确认之后，首播复盘必须在首播完成之后。

### 礼物提报归属

```ts
export type SubmissionAssignmentStatus =
  | 'pending_confirmation'
  | 'confirmed'
```

既有提报迁移后默认为 `confirmed`。新提报从主播档案读取主播名、当前运营和归属记录，客户端传入的旧版主播名和运营ID一律忽略。

## 2. Task 1：用失败测试锁定数据规则

**Files:**

- Modify: `api/src/modules/anchors/anchors.service.spec.ts`
- Create: `api/src/modules/onboarding/onboarding.service.spec.ts`
- Create: `api/src/modules/submissions/submissions.service.spec.ts`

- [ ] **Step 1: 为岗前节点写失败测试**

覆盖运营只能读取和更新自己已确认归属的主播、节点不能跳过、首播完成记录开播时间、首播复盘保存结论。

- [ ] **Step 2: 为礼物固定运营写失败测试**

覆盖服务端忽略伪造的 `operatorId`/`anchorName`、确认归属直接生成 `confirmed` 提报、待确认归属生成 `pending_confirmation` 提报且不发送通知。

- [ ] **Step 3: 为归属确认联动写失败测试**

确认运营归属时应初始化岗前进度，并把该主播所有待确认礼物提报转为 `confirmed` 和当前运营。

- [ ] **Step 4: 运行定向测试并确认失败**

Run:

```bash
cd api
npm test -- onboarding.service.spec.ts submissions.service.spec.ts anchors.service.spec.ts
```

Expected: FAIL，缺少岗前模型、服务和礼物归属字段。

## 3. Task 2：扩展Prisma模型和迁移

**Files:**

- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/202607230002_add_onboarding_and_fixed_submission_operator/migration.sql`

- [ ] **Step 1: 新增枚举**

增加 `OnboardingMilestoneType`、`OnboardingMilestoneStatus` 和 `SubmissionAssignmentStatus`。

- [ ] **Step 2: 新增岗前模型**

新增 `AnchorOnboardingProgress` 和 `AnchorOnboardingMilestone`。进度与主播一对一，节点按主播和类型唯一；保存当前节点、首播时间、首播异常原因和首播复盘完成时间。

- [ ] **Step 3: 扩展礼物提报**

`Submission` 新增可空 `anchorProfileId`、`operatorAssignmentId`，新增主播名和运营名快照，以及默认 `confirmed` 的归属状态。保留原有 `anchorUserId`、`anchorName`、`operatorId` 以兼容旧数据。

- [ ] **Step 4: 写可回滚迁移**

先增加可空字段和默认值，再为现有数据回填快照；不要删除旧字段或旧索引。

- [ ] **Step 5: 校验并生成客户端**

Run:

```bash
cd api
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/shouji' npx prisma validate
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/shouji' npx prisma generate
```

## 4. Task 3：实现岗前进度API

**Files:**

- Create: `api/src/modules/onboarding/onboarding.module.ts`
- Create: `api/src/modules/onboarding/onboarding.controller.ts`
- Create: `api/src/modules/onboarding/onboarding.service.ts`
- Create: `api/src/modules/onboarding/dto/update-milestone.dto.ts`
- Create: `api/src/modules/onboarding/dto/complete-first-live.dto.ts`
- Create: `api/src/modules/onboarding/dto/complete-first-live-review.dto.ts`
- Modify: `api/src/app.module.ts`
- Modify: `api/src/modules/anchors/anchors.service.ts`

- [ ] **Step 1: 增加运营数据域接口**

实现：

```text
GET   /api/operators/me/anchors/:anchorId/onboarding
PATCH /api/operators/me/anchors/:anchorId/onboarding/:milestone
POST  /api/operators/me/anchors/:anchorId/first-live
POST  /api/operators/me/anchors/:anchorId/first-live-review
```

- [ ] **Step 2: 实现顺序校验和幂等完成**

重复完成相同节点返回当前状态；跳过前置节点返回业务错误。所有写操作先验证当前运营和 `confirmed` 归属。

- [ ] **Step 3: 归属确认时初始化进度**

确认归属事务中建立八个待完成节点，并自动完成 `operator_received`。同一主播重复确认不得产生重复节点。

- [ ] **Step 4: 运行岗前测试**

Run:

```bash
cd api
npm test -- onboarding.service.spec.ts anchors.service.spec.ts
```

Expected: PASS。

## 5. Task 4：改造礼物提报服务端归属

**Files:**

- Modify: `api/src/modules/submissions/dto/create-submission.dto.ts`
- Modify: `api/src/modules/submissions/dto/update-submission.dto.ts`
- Modify: `api/src/modules/submissions/submissions.service.ts`
- Modify: `api/src/modules/anchors/anchors.service.ts`
- Modify: `api/src/modules/exports/exports.service.ts`
- Modify: `api/src/modules/dashboard/dashboard.service.ts`

- [ ] **Step 1: 兼容旧客户端DTO**

将 `anchorName` 和 `operatorId` 改为可选兼容字段，但服务端不读取它们决定归属。

- [ ] **Step 2: 从主播档案解析归属**

创建或修改提报时，以登录企微用户查找主播档案、当前运营及最新有效归属。不存在档案或不存在当前运营时拒绝提报。

- [ ] **Step 3: 区分待确认和已确认**

待确认记录可保存在主播个人记录中，但不触发通知；运营审核列表、超管处理列表、导出和统计只包含 `confirmed`。

- [ ] **Step 4: 归属确认时释放待处理记录**

运营确认主播归属的同一事务内，将该主播的待确认提报更新为当前运营及当前归属，并标记 `confirmed`。

- [ ] **Step 5: 禁止修改身份归属**

主播修改自己的提报时只能修改直播日期、时间、明细和附件，不能修改主播名、运营或归属状态。

- [ ] **Step 6: 运行礼物回归测试**

Run:

```bash
cd api
npm test -- submissions.service.spec.ts anchors.service.spec.ts
```

Expected: PASS。

## 6. Task 5：增加运营岗前进度Web工作台

**Files:**

- Create: `src/pages/OperatorOnboardingPage.tsx`
- Modify: `src/pages/OperatorAnchorsPage.tsx`
- Modify: `src/lib/api.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: 在我的主播列表展示下一节点**

每位主播显示归属状态、已完成数量和下一待办；只有确认归属后出现“管理岗前进度”入口。

- [ ] **Step 2: 建立八节点详情页**

采用时间线展示已完成、当前待完成和后续节点，完成动作支持备注。首播完成额外填写首播时间，首播复盘额外填写复盘结论。

- [ ] **Step 3: 处理异常和空状态**

接口失败显示可重试提示；没有已确认主播时给出明确空状态。

- [ ] **Step 4: 构建Web**

Run:

```bash
npm run build
```

Expected: PASS。

## 7. Task 6：改造主播小程序礼物提报

**Files:**

- Modify: `miniapp-anchor/src/types/submission.ts`
- Modify: `miniapp-anchor/src/pages/submit/index.tsx`
- Modify: `miniapp-anchor/src/pages/submit/index.module.scss`
- Modify: `miniapp-anchor/src/pages/record-detail/index.tsx`
- Modify: `miniapp-anchor/src/pages/records/index.tsx`
- Modify: `miniapp-anchor/src/utils/format.ts`
- Modify: `miniapp-anchor/src/store/session.ts`

- [ ] **Step 1: 移除可编辑主播名和运营选择器**

提报页只读展示档案主播名、固定运营和归属状态；提交载荷不再包含主播名和运营ID。

- [ ] **Step 2: 支持待确认归属**

`pending_confirmation` 主播允许进入礼物业务；提报成功后提示“已保存，运营确认归属后进入处理”，个人记录展示“归属待确认”。

- [ ] **Step 3: 保持未激活拦截**

`not_eligible`、`not_activated` 继续进入激活引导；`pending_confirmation` 和 `active` 可进入主业务。

- [ ] **Step 4: 构建小程序**

Run:

```bash
cd miniapp-anchor
npm run build:weapp
```

Expected: PASS，仅允许保留既有Tailwind `content` 警告。

## 8. Task 7：完整验证和文档交接

**Files:**

- Modify: `api/README.md`
- Modify: `README.md`

- [ ] **Step 1: 记录部署顺序**

说明正式环境必须先备份数据库、执行迁移、部署API，再部署Web和小程序；迁移前后核对既有提报数量。

- [ ] **Step 2: 记录业务边界**

明确本阶段未包含课程、报名、腾讯会议、参与记录和培训排课，这些进入阶段C。

- [ ] **Step 3: 运行完整检查**

Run:

```bash
cd api
npm test
npm run lint
npm run build
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/shouji' npx prisma validate

cd ..
npm run build

cd miniapp-anchor
npm run build:weapp
```

Expected: 全部PASS；不连接或修改真实数据库。

- [ ] **Step 4: 检查工作区和变更范围**

Run:

```bash
git status --short
git diff --stat c93ddf6..HEAD
```

确认所有变更只发生在 `/Users/gq/Movies/shouji_副本`，原项目 `/Users/gq/Movies/shouji` 未修改。
