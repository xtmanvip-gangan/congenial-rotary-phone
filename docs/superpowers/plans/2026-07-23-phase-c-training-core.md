# Phase C Training Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development for every behavior change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在统一主播档案上建立课程、资料、固定排课模板、场次、报名、候补、取消补位和学习进度，使培训中心、主播和运营完成完整报名闭环。

**Architecture:** 新增独立 `training` 模块，课程与具体场次分离，报名表同时表达正式名额和候补顺序，课程级学习进度独立汇总。所有主播和运营权限均从共享主播档案及固定运营归属读取；容量判断、重复报名和候补补位在数据库事务中完成。腾讯会议、Excel参会导入、通知、推荐、应用反馈和问题池留到阶段D。

**Tech Stack:** React 19、TypeScript、Vite、Taro 4、NestJS 11、Prisma 6、PostgreSQL、Vitest。

---

## 1. 状态约定

```ts
type TrainingSessionStatus =
  | 'draft'
  | 'published'
  | 'in_progress'
  | 'ended'
  | 'cancelled'
  | 'rescheduled'
  | 'publish_failed'

type TrainingRegistrationStatus =
  | 'registered'
  | 'waitlisted'
  | 'cancelled'
  | 'learned'
  | 'leave'
  | 'absent'
  | 'abnormal_exit'
  | 'needs_makeup'

type TrainingLearningType = 'first_learning' | 'review' | 'makeup'
type TrainingProgressStatus = 'not_started' | 'registered' | 'learned'
type TrainingMakeupStatus =
  | 'none'
  | 'needs_relearning'
  | 'waiting_makeup'
  | 'made_up'
```

同一主播同一场次仅保留一条报名记录。取消后重新报名更新原记录，不能重复占位。

## 2. Task 1：用失败测试锁定培训主规则

**Files:**

- Create: `api/src/modules/training/training.service.spec.ts`

- [ ] **Step 1: 写课程与发布权限失败测试**

培训管理员可以维护课程和发布场次；培训老师只能读取和执行场次；运营和主播不能修改课程。

- [ ] **Step 2: 写报名与候补失败测试**

覆盖正式名额、满员候补、同场唯一、开课后不能报名或取消，以及归属待确认主播本人仍可报名。

- [ ] **Step 3: 写运营代报名数据域失败测试**

运营只能为自己已确认归属且状态正常的主播报名；不能为待确认或其他运营主播报名。

- [ ] **Step 4: 写取消补位失败测试**

正式报名取消后，最早候补在同一事务内补位；候补取消只退出队列。

- [ ] **Step 5: 写学习进度失败测试**

首次 `learned` 建立完成时间，重复学习只更新最近时间；`needs_makeup` 不覆盖历史完成结果。

- [ ] **Step 6: 运行测试并确认失败**

Run:

```bash
cd api
npm test -- training.service.spec.ts
```

Expected: FAIL，培训模块尚不存在。

## 3. Task 2：新增培训Schema、增量SQL和课程1—7

**Files:**

- Modify: `api/prisma/schema.prisma`
- Create: `migrations/202607230003_add_training_core.sql`

- [ ] **Step 1: 新增培训枚举和模型**

新增：

- `TrainingCourse`
- `TrainingMaterialLink`
- `TrainingScheduleTemplate`
- `TrainingSession`
- `TrainingRegistration`
- `TrainingLearningProgress`

- [ ] **Step 2: 增加唯一约束和查询索引**

至少包括：

- 课程编号唯一。
- `anchorProfileId + sessionId` 唯一。
- `anchorProfileId + courseId` 唯一。
- 场次时间、状态索引。
- 候补状态、顺序索引。

- [ ] **Step 3: SQL初始化课程1—7**

写入已确认名称和层级，不写视频地址。课程摘要、目标、实践任务和FAQ使用JSON；飞书资料使用独立链接表。

- [ ] **Step 4: 校验Prisma**

Run:

```bash
cd api
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/shouji' npx prisma validate
DATABASE_URL='postgresql://postgres:postgres@localhost:5432/shouji' npx prisma generate
```

## 4. Task 3：实现课程、资料与固定排课模板

**Files:**

- Create: `api/src/modules/training/training.module.ts`
- Create: `api/src/modules/training/training.controller.ts`
- Create: `api/src/modules/training/training.service.ts`
- Create: `api/src/modules/training/dto/create-course.dto.ts`
- Create: `api/src/modules/training/dto/update-course.dto.ts`
- Create: `api/src/modules/training/dto/create-schedule-template.dto.ts`
- Create: `api/src/modules/training/dto/create-session.dto.ts`
- Modify: `api/src/app.module.ts`

- [ ] **Step 1: 课程和资料接口**

实现课程列表、详情、创建和修改。培训管理员可写；主播、运营和培训老师按权限只读已启用课程。

- [ ] **Step 2: 固定模板接口**

模板保存星期一至星期六、A/B周、开课时间、时长、容量和课程。校验18:00—20:00之间且不超过60分钟。

- [ ] **Step 3: 生成下周场次草稿**

按模板幂等生成下周草稿；同一模板和日期重复执行不能产生重复场次。周日不生成。

- [ ] **Step 4: 发布、取消和改期**

培训管理员发布草稿。阶段C发布只改变业务状态；阶段D再由腾讯会议适配器创建会议。

## 5. Task 4：实现报名、候补、取消补位和学习进度

**Files:**

- Create: `api/src/modules/training/dto/register-session.dto.ts`
- Create: `api/src/modules/training/dto/operator-register.dto.ts`
- Create: `api/src/modules/training/dto/complete-registration.dto.ts`
- Modify: `api/src/modules/training/training.controller.ts`
- Modify: `api/src/modules/training/training.service.ts`

- [ ] **Step 1: 主播本人报名和取消**

主播可报名已发布、未开始的场次。归属待确认仍允许本人报名；未激活主播拒绝。开课前可取消。

- [ ] **Step 2: 运营单人和批量代报名**

运营仅可为自己已确认归属主播操作。批量请求逐人返回成功、候补或失败原因，不能因一人失败回滚全部。

- [ ] **Step 3: 培训人员代报名**

培训老师和培训管理员可为任意有效主播代报名，并保存来源、操作人及运营快照。

- [ ] **Step 4: 容量和候补**

正式名额达到容量后按报名时间进入候补，保存连续候补顺序。正式报名取消时事务补位最早候补。

- [ ] **Step 5: 课堂人工结论**

培训老师或管理员可标记 `learned`、`leave`、`absent`、`abnormal_exit`、`needs_makeup`，非 `learned` 结论必须填写原因。

- [ ] **Step 6: 更新课程级汇总**

首次学完保存 `firstLearnedAt`，复习更新 `lastLearnedAt`；补学完成设置 `made_up`，不覆盖首次完成时间。

## 6. Task 5：培训中心和运营Web基础页面

**Files:**

- Create: `src/pages/TrainingCoursesPage.tsx`
- Create: `src/pages/TrainingSessionsPage.tsx`
- Create: `src/pages/OperatorTrainingPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/StaffHomePage.tsx`

- [ ] **Step 1: 培训管理员课程页**

展示课程1—7、层级、资料链接、目标和实践任务，支持启停和基础编辑。

- [ ] **Step 2: 场次与排课页**

展示草稿、已发布、容量、报名和候补数量；支持创建、发布、取消、查看名单和课堂人工结论。

- [ ] **Step 3: 运营代报名页**

运营查看自己已确认主播、开放场次和每人课程进度，支持单人和批量代报名。

- [ ] **Step 4: 角色导航**

培训管理员进入课程及排课；培训老师进入场次执行；运营进入代报名。

## 7. Task 6：主播小程序培训中心

**Files:**

- Create: `miniapp-anchor/src/types/training.ts`
- Create: `miniapp-anchor/src/services/training.ts`
- Create: `miniapp-anchor/src/pages/training/index.tsx`
- Create: `miniapp-anchor/src/pages/training/index.config.ts`
- Create: `miniapp-anchor/src/pages/training/index.module.scss`
- Modify: `miniapp-anchor/src/app.config.ts`
- Modify: `miniapp-anchor/src/pages/mine/index.tsx`

- [ ] **Step 1: 本周和全部开放场次**

显示课程、时间、老师、剩余名额、报名状态和候补位置。

- [ ] **Step 2: 本人报名和取消**

报名后立即显示正式名额或候补；开课前允许取消。归属待确认主播可以使用。

- [ ] **Step 3: 学习进度**

显示课程1—7的未开始、已报名、已学习和待补学，不显示考试、分数或排名。

- [ ] **Step 4: 资料入口**

显示飞书手册链接；不上传、不播放录播视频。

## 8. Task 7：完整验证和交接

**Files:**

- Modify: `README.md`
- Modify: `api/README.md`

- [ ] **Step 1: 记录数据库升级顺序**

备份后依次执行阶段A、B、C增量SQL，再部署API、Web和小程序。禁止直接修改真实数据库验证。

- [ ] **Step 2: 记录阶段边界**

腾讯会议、Excel参会导入、企业微信通知、推荐、应用反馈、问题池和周会明确进入阶段D。

- [ ] **Step 3: 全量验证**

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

- [ ] **Step 4: Git与范围检查**

确认工作区干净，所有改动仅位于 `/Users/gq/Movies/shouji_副本`。
