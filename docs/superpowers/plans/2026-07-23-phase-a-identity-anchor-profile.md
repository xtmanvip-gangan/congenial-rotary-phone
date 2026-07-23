# Phase A Identity and Anchor Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有礼物收集项目中建立隔离的三类登录、员工多角色、审核激活任务、主播本人激活档案和固定运营归属，为后续岗前、培训和礼物自动归属提供统一主数据。

**Architecture:** 保留现有 `OperatorAccount` 和礼物业务关系以降低回归风险，新增员工角色关联、激活任务、主播档案和运营归属历史。企业微信Web登录只接受预录入的非超管员工，企业微信小程序只建立主播会话，超级管理员只允许外部账号密码登录。前端继续沿用现有React Web和Taro小程序，通过角色数组和后端数据域校验展示不同工作台。

**Tech Stack:** React 19、TypeScript、Vite、Taro 4、NestJS 11、Prisma 6、PostgreSQL、Vitest。

---

## 1. 本阶段文件结构

### API新增

- `api/src/modules/access/access.service.ts`：统一角色和数据域校验。
- `api/src/modules/access/access.module.ts`：导出权限服务。
- `api/src/modules/staff/staff.module.ts`：员工账号与多角色模块。
- `api/src/modules/staff/staff.controller.ts`：超管员工管理和员工自信息接口。
- `api/src/modules/staff/staff.service.ts`：员工新增、角色更新、启停和可选运营列表。
- `api/src/modules/staff/dto/create-staff.dto.ts`：员工创建参数。
- `api/src/modules/staff/dto/update-staff-roles.dto.ts`：员工角色更新参数。
- `api/src/modules/staff/dto/update-staff-status.dto.ts`：员工状态更新参数。
- `api/src/modules/activation/activation.module.ts`：审核激活任务模块。
- `api/src/modules/activation/activation.controller.ts`：激活任务创建、列表和提醒接口。
- `api/src/modules/activation/activation.service.ts`：激活任务状态机。
- `api/src/modules/activation/dto/create-activation-task.dto.ts`：激活任务参数。
- `api/src/modules/anchors/anchors.module.ts`：主播档案和运营归属模块。
- `api/src/modules/anchors/anchors.controller.ts`：主播本人、运营和超管接口。
- `api/src/modules/anchors/anchors.service.ts`：激活、选择运营、确认、驳回和列表。
- `api/src/modules/anchors/dto/activate-anchor.dto.ts`：主播激活参数。
- `api/src/modules/anchors/dto/select-operator.dto.ts`：选择运营参数。
- `api/src/modules/anchors/dto/reject-assignment.dto.ts`：驳回原因。
- `api/src/modules/auth/auth.service.spec.ts`
- `api/src/modules/staff/staff.service.spec.ts`
- `api/src/modules/activation/activation.service.spec.ts`
- `api/src/modules/anchors/anchors.service.spec.ts`

### API修改

- `api/package.json`、`api/package-lock.json`：增加Vitest测试能力。
- `api/prisma/schema.prisma`：新增角色、激活、主播档案和归属模型。
- `api/src/app.module.ts`：注册新增模块。
- `api/src/modules/auth/auth.types.ts`：会话支持多角色和入口类型。
- `api/src/modules/auth/auth.service.ts`：分离Web企微、主播小程序和超管密码登录。
- `api/src/modules/auth/auth.controller.ts`：保留Web企微和超管密码接口并限制入口。
- `api/src/modules/auth/miniapp-auth.controller.ts`：返回主播激活状态。
- `api/src/modules/operators/*`：保留旧路由兼容，但内部委托员工模块或仅查询运营。

### Web新增

- `src/components/RoleWorkspaceSwitcher.tsx`：多角色工作台切换。
- `src/pages/StaffManagementPage.tsx`：超管维护企微UID、姓名、角色和状态。
- `src/pages/AuditActivationPage.tsx`：审核老师创建和跟进激活任务。
- `src/pages/OperatorAnchorsPage.tsx`：运营确认归属和查看自己的主播。

### Web修改

- `src/lib/auth.ts`：增加角色数组、激活状态和工作台路径。
- `src/components/AuthGate.tsx`：按角色数组鉴权。
- `src/pages/LoginPage.tsx`：外部浏览器只显示超管密码登录，企微内只显示企微登录。
- `src/pages/AuthCallbackPage.tsx`：按角色数组进入工作台。
- `src/App.tsx`：增加员工管理、审核和运营主播路由与导航。
- `src/pages/OperatorManagementPage.tsx`：由新员工管理页替代，保留路由跳转兼容。

### 小程序新增

- `miniapp-anchor/src/types/anchor.ts`：主播档案和激活类型。
- `miniapp-anchor/src/services/anchors.ts`：档案、激活、运营列表和选择接口。
- `miniapp-anchor/src/pages/activate/index.tsx`
- `miniapp-anchor/src/pages/activate/index.config.ts`
- `miniapp-anchor/src/pages/activate/index.module.scss`

### 小程序修改

- `miniapp-anchor/src/types/auth.ts`：增加 `anchorProfileStatus`。
- `miniapp-anchor/src/services/auth.ts`：登录后保存激活状态。
- `miniapp-anchor/src/app.config.ts`：注册激活页。
- `miniapp-anchor/src/app.tsx`：未激活时引导到激活页。
- `miniapp-anchor/src/pages/mine/index.tsx`：展示主播名、运营和确认状态。

## 2. 状态与类型约定

### 员工角色

```ts
export type StaffRole =
  | 'audit_teacher'
  | 'operator'
  | 'training_teacher'
  | 'training_admin'

export type AppRole = 'anchor' | StaffRole | 'super_admin'
```

超级管理员不进入 `StaffRoleAssignment`。员工会话包含 `roles: StaffRole[]` 和用于当前工作台的 `role: StaffRole`；小程序会话固定为 `role: 'anchor'`；密码会话固定为 `role: 'super_admin'`。

### 激活任务

```ts
export type ActivationTaskStatus =
  | 'pending'
  | 'invited'
  | 'activated'
  | 'cancelled'
```

### 运营归属

```ts
export type OperatorAssignmentStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'rejected'
  | 'ended'
```

### 主播状态

```ts
export type AnchorStatus = 'active' | 'paused' | 'exited'
```

## 3. Task 1：建立API测试基线

**Files:**

- Modify: `api/package.json`
- Modify: `api/package-lock.json`
- Create: `api/vitest.config.ts`
- Create: `api/src/modules/auth/auth.service.spec.ts`

- [ ] **Step 1: 安装测试和密码哈希依赖并增加脚本**

Run:

```bash
npm install --save-dev vitest
npm install argon2
```

在 `api/package.json` 增加：

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: 创建Vitest配置**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    clearMocks: true,
  },
})
```

- [ ] **Step 3: 写入口隔离失败测试**

测试必须覆盖：

```ts
it('rejects password login for a non-super-admin account', async () => {
  prisma.operatorAccount.findFirst.mockResolvedValue({
    id: 'staff-1',
    username: 'operator',
    passwordHash: 'stored',
    displayName: '运营A',
    role: 'operator',
  })

  await expect(service.loginWithPassword('operator', 'secret')).rejects.toThrow(
    '账号或密码错误',
  )
})

it('rejects web wecom login when the uid is not pre-registered', async () => {
  wecom.resolveUserProfileByCode.mockResolvedValue({
    userId: 'unknown',
    name: '未知员工',
    avatarUrl: null,
  })
  prisma.operatorAccount.findUnique.mockResolvedValue(null)

  await expect(service.loginWithWecomCode('code')).rejects.toThrow(
    '当前企微账号未开通后台权限',
  )
})
```

- [ ] **Step 4: 运行并确认测试失败**

Run:

```bash
npm test -- auth.service.spec.ts
```

Expected: FAIL，现有密码登录允许运营账号，未知企微UID会降级为主播。

- [ ] **Step 5: 提交测试基线**

```bash
git add api/package.json api/package-lock.json api/vitest.config.ts api/src/modules/auth/auth.service.spec.ts
git commit -m "test: add api authentication test baseline"
```

## 4. Task 2：新增共享主数据Schema和迁移

**Files:**

- Modify: `api/prisma/schema.prisma`
- Create: `migrations/202607230001_add_identity_and_anchor_profiles.sql`

- [ ] **Step 1: 增加Prisma枚举**

```prisma
enum StaffRole {
  audit_teacher
  operator
  training_teacher
  training_admin
}

enum ActivationTaskStatus {
  pending
  invited
  activated
  cancelled
}

enum AnchorProfileStatus {
  active
  paused
  exited
}

enum OperatorAssignmentStatus {
  pending_confirmation
  confirmed
  rejected
  ended
}
```

- [ ] **Step 2: 增加员工角色模型**

```prisma
model StaffRoleAssignment {
  id        String          @id @default(uuid()) @db.Uuid
  accountId String          @map("account_id") @db.Uuid
  role      StaffRole
  createdBy String?         @map("created_by") @db.Uuid
  createdAt DateTime        @default(now()) @map("created_at")
  account   OperatorAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)

  @@unique([accountId, role])
  @@map("staff_role_assignments")
}
```

在 `OperatorAccount` 增加：

```prisma
staffRoles StaffRoleAssignment[]
activationTasks AnchorActivationTask[]
currentAnchors AnchorProfile[] @relation("CurrentAnchorOperator")
anchorAssignments AnchorOperatorAssignment[]
```

- [ ] **Step 3: 增加激活、主播档案和运营归属模型**

```prisma
model AnchorActivationTask {
  id                       String               @id @default(uuid()) @db.Uuid
  expectedWecomUserId      String               @unique @map("expected_wecom_user_id") @db.VarChar(64)
  wecomDisplayNameSnapshot String               @map("wecom_display_name_snapshot") @db.VarChar(100)
  auditTeacherId           String               @map("audit_teacher_id") @db.Uuid
  membershipCompletedAt    DateTime             @map("membership_completed_at")
  deviceReadyAt            DateTime             @map("device_ready_at")
  status                   ActivationTaskStatus @default(pending)
  invitationSentAt         DateTime?            @map("invitation_sent_at")
  invitationCount          Int                  @default(0) @map("invitation_count")
  activatedAnchorProfileId String?              @unique @map("activated_anchor_profile_id") @db.Uuid
  createdAt                DateTime             @default(now()) @map("created_at")
  updatedAt                DateTime             @updatedAt @map("updated_at")
  auditTeacher             OperatorAccount      @relation(fields: [auditTeacherId], references: [id])
  activatedAnchorProfile   AnchorProfile?       @relation(fields: [activatedAnchorProfileId], references: [id])

  @@index([status, createdAt])
  @@map("anchor_activation_tasks")
}

model AnchorProfile {
  id                    String                   @id @default(uuid()) @db.Uuid
  wecomUserRecordId     String                   @unique @map("wecom_user_record_id") @db.Uuid
  anchorDisplayName     String                   @map("anchor_display_name") @db.VarChar(100)
  currentOperatorId     String?                  @map("current_operator_id") @db.Uuid
  assignmentStatus      OperatorAssignmentStatus? @map("assignment_status")
  source                String                   @default("activation") @db.VarChar(30)
  status                AnchorProfileStatus      @default(active)
  activatedAt           DateTime                 @default(now()) @map("activated_at")
  createdAt             DateTime                 @default(now()) @map("created_at")
  updatedAt             DateTime                 @updatedAt @map("updated_at")
  wecomUser             WecomUser                @relation(fields: [wecomUserRecordId], references: [id])
  currentOperator       OperatorAccount?         @relation("CurrentAnchorOperator", fields: [currentOperatorId], references: [id])
  assignments           AnchorOperatorAssignment[]
  activationTask        AnchorActivationTask?
  nameHistory           AnchorNameHistory[]

  @@index([currentOperatorId, assignmentStatus])
  @@map("anchor_profiles")
}

model AnchorNameHistory {
  id              String        @id @default(uuid()) @db.Uuid
  anchorProfileId String        @map("anchor_profile_id") @db.Uuid
  oldName         String        @map("old_name") @db.VarChar(100)
  newName         String        @map("new_name") @db.VarChar(100)
  changedByType   String        @map("changed_by_type") @db.VarChar(30)
  changedById     String?       @map("changed_by_id") @db.VarChar(64)
  createdAt       DateTime      @default(now()) @map("created_at")
  anchorProfile   AnchorProfile @relation(fields: [anchorProfileId], references: [id], onDelete: Cascade)

  @@map("anchor_name_history")
}

model AnchorOperatorAssignment {
  id              String                   @id @default(uuid()) @db.Uuid
  anchorProfileId String                   @map("anchor_profile_id") @db.Uuid
  operatorId      String                   @map("operator_id") @db.Uuid
  status          OperatorAssignmentStatus @default(pending_confirmation)
  startedAt       DateTime?                @map("started_at")
  endedAt         DateTime?                @map("ended_at")
  initiatedBy     String                   @map("initiated_by") @db.VarChar(64)
  confirmedBy     String?                  @map("confirmed_by") @db.VarChar(64)
  reason          String?
  createdAt       DateTime                 @default(now()) @map("created_at")
  updatedAt       DateTime                 @updatedAt @map("updated_at")
  anchorProfile   AnchorProfile            @relation(fields: [anchorProfileId], references: [id], onDelete: Cascade)
  operator        OperatorAccount          @relation(fields: [operatorId], references: [id])

  @@index([anchorProfileId, status])
  @@index([operatorId, status])
  @@map("anchor_operator_assignments")
}
```

补齐 `WecomUser` 和 `OperatorAccount` 反向关系。不要给 `AnchorOperatorAssignment` 添加会阻止保留历史的全局唯一约束；“每个主播只有一个有效归属”由事务内检查和部分唯一索引实现。

- [ ] **Step 4: 编写SQL迁移**

SQL必须创建对应枚举、表、外键、索引，并增加仅约束有效归属的部分唯一索引：

```sql
CREATE UNIQUE INDEX "uq_anchor_one_open_assignment"
ON "anchor_operator_assignments" ("anchor_profile_id")
WHERE "status" IN ('pending_confirmation', 'confirmed');
```

- [ ] **Step 5: 校验Schema**

Run:

```bash
npx prisma format
npx prisma validate
npx prisma generate
npm run build
```

Expected: 全部退出码0。

- [ ] **Step 6: 提交Schema**

```bash
git add api/prisma/schema.prisma migrations/202607230001_add_identity_and_anchor_profiles.sql
git commit -m "feat: add staff anchor and assignment schema"
```

## 5. Task 3：隔离三类登录并支持员工多角色

**Files:**

- Modify: `api/src/modules/auth/auth.types.ts`
- Modify: `api/src/modules/auth/auth.service.ts`
- Modify: `api/src/modules/auth/auth.controller.ts`
- Modify: `api/src/modules/auth/miniapp-auth.controller.ts`
- Modify: `api/src/modules/auth/auth.service.spec.ts`

- [ ] **Step 1: 扩展会话类型**

```ts
export type StaffRole =
  | 'audit_teacher'
  | 'operator'
  | 'training_teacher'
  | 'training_admin'

export type AppRole = 'anchor' | StaffRole | 'super_admin'

export type AuthenticatedUser = {
  accountId?: string | null
  wecomUserId: string
  name: string
  avatarUrl: string | null
  role: AppRole
  roles: AppRole[]
  loginType: 'wecom_staff' | 'wecom_miniapp' | 'password_admin'
  anchorProfileStatus?: 'not_eligible' | 'not_activated' | 'pending_confirmation' | 'active'
}
```

令牌负载同样保存 `roles` 和新的 `loginType`。

- [ ] **Step 2: 实现Web企微员工登录**

`loginWithWecomCode` 必须：

1. 取得企微身份。
2. 按UID查询启用中的 `OperatorAccount`。
3. 查询 `StaffRoleAssignment`。
4. 账号不存在、停用或无角色时抛出 `UnauthorizedException('当前企微账号未开通后台权限')`。
5. 即使旧 `OperatorAccount.role` 是 `super_admin`，也不得通过企微登录。
6. 返回全部员工角色，主角色按 `training_admin → training_teacher → audit_teacher → operator` 的稳定顺序选择。

- [ ] **Step 3: 实现主播小程序登录**

`loginWithMiniappCode` 必须：

1. 创建或更新 `WecomUser`。
2. 查询 `AnchorProfile` 和 `AnchorActivationTask`。
3. 固定返回 `role: 'anchor'`、`roles: ['anchor']`。
4. 根据数据返回 `anchorProfileStatus`。
5. 不因为UID同时属于员工而返回后台角色。

- [ ] **Step 4: 限制密码登录**

查询条件必须包含：

```ts
where: {
  username: normalizedUsername,
  role: 'super_admin',
  status: 'active',
}
```

密码会话固定返回：

```ts
role: 'super_admin',
roles: ['super_admin'],
loginType: 'password_admin',
```

- [ ] **Step 5: 升级超管密码哈希**

新密码使用：

```ts
import argon2 from 'argon2'

const passwordHash = await argon2.hash(password, {
  type: argon2.argon2id,
})
```

登录时先识别 `$argon2id$` 并调用 `argon2.verify`。如果数据库仍是现有SHA-256格式，仅在旧哈希验证成功后立刻更新为Argon2id；验证失败不得更新。这保证副本中已有超管账号可以平滑升级。

- [ ] **Step 6: 补全测试**

至少覆盖：

- 未录入UID的Web企微登录被拒绝。
- 已停用员工被拒绝。
- 多角色员工返回全部角色。
- 超管不能企微登录。
- 非超管不能密码登录。
- 小程序登录永远返回主播角色。
- 小程序正确返回四种激活状态。
- 旧超管哈希首次成功登录后升级为Argon2id。

- [ ] **Step 7: 运行测试和构建**

Run:

```bash
npm test -- auth.service.spec.ts
npm run build
```

Expected: PASS，构建退出码0。

- [ ] **Step 8: 提交**

```bash
git add api/src/modules/auth
git commit -m "feat: separate admin staff and anchor authentication"
```

## 6. Task 4：员工账号和多角色管理

**Files:**

- Create: `api/src/modules/access/access.service.ts`
- Create: `api/src/modules/access/access.module.ts`
- Create: `api/src/modules/staff/staff.module.ts`
- Create: `api/src/modules/staff/staff.controller.ts`
- Create: `api/src/modules/staff/staff.service.ts`
- Create: `api/src/modules/staff/dto/create-staff.dto.ts`
- Create: `api/src/modules/staff/dto/update-staff-roles.dto.ts`
- Create: `api/src/modules/staff/dto/update-staff-status.dto.ts`
- Create: `api/src/modules/staff/staff.service.spec.ts`
- Modify: `api/src/app.module.ts`

- [ ] **Step 1: 写权限失败测试**

```ts
it('allows only password super admin to create staff', async () => {
  await expect(
    service.createStaff(
      { role: 'operator', roles: ['operator'], loginType: 'wecom_staff' },
      dto,
    ),
  ).rejects.toThrow('只有超级管理员可以管理员工账号')
})
```

- [ ] **Step 2: 实现AccessService**

提供异步权限方法，并在每次敏感请求中从数据库重新确认账号状态和最新角色，避免员工被停用或角色移除后旧令牌继续生效：

```ts
requirePasswordSuperAdmin(user: AuthenticatedUser): Promise<void>
requireAnyRole(user: AuthenticatedUser, roles: StaffRole[]): Promise<void>
hasRole(user: AuthenticatedUser, role: AppRole): Promise<boolean>
```

`requirePasswordSuperAdmin` 同时检查 `role === 'super_admin'` 和 `loginType === 'password_admin'`。

- [ ] **Step 3: 实现员工DTO**

`CreateStaffDto`：

```ts
displayName: string
wecomUserId: string
roles: StaffRole[]
```

不接受员工用户名和密码。角色数组至少1项，去重后只能包含四种员工角色。

- [ ] **Step 4: 实现StaffService**

提供：

- `listStaff`
- `createStaff`
- `updateRoles`
- `updateStatus`
- `listActiveOperators`

创建员工时：

```ts
await prisma.$transaction(async (tx) => {
  const account = await tx.operatorAccount.create({
    data: {
      displayName,
      wecomUserId,
      role: roles.includes('operator') ? 'operator' : 'operator',
      status: 'active',
      username: null,
      passwordHash: null,
    },
  })

  await tx.staffRoleAssignment.createMany({
    data: roles.map((role) => ({
      accountId: account.id,
      role,
      createdBy: currentUser.accountId,
    })),
  })
})
```

旧 `role` 字段仅作兼容，所有新授权以角色关联表为准。

- [ ] **Step 5: 实现接口**

- `GET /api/staff`
- `POST /api/staff`
- `PATCH /api/staff/:id/roles`
- `PATCH /api/staff/:id/status`
- `GET /api/staff/operators/active`

最后一个接口允许主播激活会话调用，只返回运营ID和显示名。

- [ ] **Step 6: 测试和提交**

Run:

```bash
npm test -- staff.service.spec.ts
npm run build
```

Expected: PASS。

```bash
git add api/src/modules/access api/src/modules/staff api/src/app.module.ts
git commit -m "feat: add staff role administration"
```

## 7. Task 5：审核激活任务

**Files:**

- Create: `api/src/modules/activation/activation.module.ts`
- Create: `api/src/modules/activation/activation.controller.ts`
- Create: `api/src/modules/activation/activation.service.ts`
- Create: `api/src/modules/activation/dto/create-activation-task.dto.ts`
- Create: `api/src/modules/activation/activation.service.spec.ts`
- Modify: `api/src/app.module.ts`

- [ ] **Step 1: 写状态机测试**

覆盖：

- 只有审核老师和培训管理员可创建任务。
- 创建任务要求入会时间和设备完成时间。
- 同一企微UID不能有两个未取消任务。
- 发送提醒将状态从 `pending` 改为 `invited` 并增加次数。
- 已激活任务不能再次取消或改绑。

- [ ] **Step 2: 实现DTO**

```ts
export class CreateActivationTaskDto {
  expectedWecomUserId!: string
  wecomDisplayName!: string
  membershipCompletedAt!: string
  deviceReadyAt!: string
}
```

使用 `class-validator` 限制UID和姓名长度，并使用 `@IsDateString()` 校验时间。

- [ ] **Step 3: 实现服务**

提供：

- `create`
- `list`
- `sendInvitation`
- `cancel`

列表默认按 `createdAt desc`，支持按状态筛选。审核老师默认只看自己创建的任务；培训管理员和超管可看全部。

第一版发送提醒通过通知服务接口留出调用点；若实际企业微信消息配置尚未接通，必须明确返回 `notificationStatus: 'not_configured'`，不能伪造发送成功。

- [ ] **Step 4: 实现接口**

- `POST /api/activation-tasks`
- `GET /api/activation-tasks`
- `POST /api/activation-tasks/:id/send`
- `POST /api/activation-tasks/:id/cancel`

- [ ] **Step 5: 测试、构建和提交**

Run:

```bash
npm test -- activation.service.spec.ts
npm run build
```

```bash
git add api/src/modules/activation api/src/app.module.ts
git commit -m "feat: add anchor activation task workflow"
```

## 8. Task 6：主播本人激活与运营归属

**Files:**

- Create: `api/src/modules/anchors/anchors.module.ts`
- Create: `api/src/modules/anchors/anchors.controller.ts`
- Create: `api/src/modules/anchors/anchors.service.ts`
- Create: `api/src/modules/anchors/dto/activate-anchor.dto.ts`
- Create: `api/src/modules/anchors/dto/select-operator.dto.ts`
- Create: `api/src/modules/anchors/dto/reject-assignment.dto.ts`
- Create: `api/src/modules/anchors/anchors.service.spec.ts`
- Modify: `api/src/app.module.ts`

- [ ] **Step 1: 写激活幂等测试**

```ts
it('returns the existing profile when the same anchor retries activation', async () => {
  prisma.anchorProfile.findUnique.mockResolvedValue(existingProfile)

  await expect(service.activate(anchorUser, dto)).resolves.toEqual(
    expect.objectContaining({ id: existingProfile.id }),
  )
  expect(prisma.anchorProfile.create).not.toHaveBeenCalled()
})
```

并覆盖：

- 没有有效激活任务时拒绝。
- 任务入会或设备信息不完整时拒绝。
- 只能选择启用且具有 `operator` 角色的员工。
- 激活创建档案和待确认归属，并把激活任务更新为已激活。
- 运营只能确认或驳回分配给自己的主播。
- 确认后写入 `currentOperatorId` 和 `confirmed`。
- 驳回后清空待选运营，主播可重新选择。
- 同一主播不能出现两条开放归属。

- [ ] **Step 2: 实现激活事务**

事务必须：

1. 查询或创建 `WecomUser`。
2. 锁定或重新查询有效激活任务。
3. 检查已有档案并幂等返回。
4. 创建 `AnchorProfile`。
5. 创建 `AnchorOperatorAssignment(pending_confirmation)`。
6. 更新档案待确认运营。
7. 更新激活任务为 `activated`。

- [ ] **Step 3: 实现接口**

- `GET /api/anchors/me`
- `POST /api/anchors/activate`
- `PATCH /api/anchors/me/display-name`
- `POST /api/anchors/me/operator-selection`
- `GET /api/operators/me/anchors`
- `GET /api/operators/me/assignments/pending`
- `POST /api/operator-assignments/:id/confirm`
- `POST /api/operator-assignments/:id/reject`

主播端接口必须要求 `loginType === 'wecom_miniapp'`；运营接口必须要求企微员工登录且具有 `operator` 角色。

- [ ] **Step 4: 运行测试和提交**

Run:

```bash
npm test -- anchors.service.spec.ts
npm test
npm run build
```

```bash
git add api/src/modules/anchors api/src/app.module.ts
git commit -m "feat: add anchor activation and operator assignment"
```

## 9. Task 7：Web多角色和员工管理

**Files:**

- Modify: `src/lib/auth.ts`
- Modify: `src/components/AuthGate.tsx`
- Create: `src/components/RoleWorkspaceSwitcher.tsx`
- Create: `src/pages/StaffManagementPage.tsx`
- Modify: `src/pages/LoginPage.tsx`
- Modify: `src/pages/AuthCallbackPage.tsx`
- Modify: `src/pages/OperatorManagementPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 更新前端会话类型**

```ts
export type StaffRole =
  | 'audit_teacher'
  | 'operator'
  | 'training_teacher'
  | 'training_admin'

export type AppRole = 'anchor' | StaffRole | 'super_admin'

export type AuthenticatedUser = {
  accountId?: string | null
  wecomUserId: string
  name: string
  avatarUrl: string | null
  role: AppRole
  roles: AppRole[]
  loginType: 'wecom_staff' | 'wecom_miniapp' | 'password_admin'
}
```

- [ ] **Step 2: 修改AuthGate**

判断改为：

```ts
const hasAllowedRole =
  !allowRoles ||
  allowRoles.some((role) => session.user.roles.includes(role))
```

- [ ] **Step 3: 隔离登录页面**

- 企业微信环境只显示企业微信登录按钮。
- 外部浏览器只显示超管账号密码表单。
- 后端拒绝错误入口，前端显示只是体验层。

- [ ] **Step 4: 实现员工管理页**

表单字段：

- 姓名
- 企微UID
- 审核老师、运营、培训老师、培训管理员多选

不显示员工账号和密码。列表支持角色修改、启用和停用。

- [ ] **Step 5: 增加多角色工作台切换**

切换只改变当前前端工作台和路由，不签发新的权限。后端始终依据令牌中的全部角色判断。

- [ ] **Step 6: 路由兼容**

`/admin/operators` 重定向或复用 `/admin/staff`，避免旧收藏地址失效。

- [ ] **Step 7: 构建和提交**

Run:

```bash
npm run build
```

Expected: TypeScript和Vite构建通过。

```bash
git add src
git commit -m "feat: add staff roles and admin management ui"
```

## 10. Task 8：审核和运营Web工作台

**Files:**

- Create: `src/pages/AuditActivationPage.tsx`
- Create: `src/pages/OperatorAnchorsPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 实现审核激活页**

包含：

- 创建激活任务表单。
- 待发送、已邀请、已激活状态筛选。
- 再次发送提醒。
- 取消未激活任务。
- 明确显示通知未配置或发送失败。

- [ ] **Step 2: 实现运营主播页**

包含两个区域：

- 待确认：主播企微展示名、主播展示名、激活时间、确认和驳回。
- 我的主播：主播名、企微名、归属确认时间和状态。

驳回必须填写原因。

- [ ] **Step 3: 注册角色路由**

- `/audit/activations`：`audit_teacher`、`training_admin`
- `/operator/anchors`：`operator`
- `/admin/staff`：`super_admin`

- [ ] **Step 4: 构建和提交**

Run:

```bash
npm run build
```

```bash
git add src/pages src/App.tsx
git commit -m "feat: add audit activation and operator anchor workspaces"
```

## 11. Task 9：主播小程序激活页面

**Files:**

- Create: `miniapp-anchor/src/types/anchor.ts`
- Create: `miniapp-anchor/src/services/anchors.ts`
- Create: `miniapp-anchor/src/pages/activate/index.tsx`
- Create: `miniapp-anchor/src/pages/activate/index.config.ts`
- Create: `miniapp-anchor/src/pages/activate/index.module.scss`
- Modify: `miniapp-anchor/src/types/auth.ts`
- Modify: `miniapp-anchor/src/services/auth.ts`
- Modify: `miniapp-anchor/src/app.config.ts`
- Modify: `miniapp-anchor/src/app.tsx`
- Modify: `miniapp-anchor/src/pages/mine/index.tsx`

- [ ] **Step 1: 扩展主播会话**

增加：

```ts
anchorProfileStatus:
  | 'not_eligible'
  | 'not_activated'
  | 'pending_confirmation'
  | 'active'
```

- [ ] **Step 2: 实现主播档案服务**

```ts
getMyAnchorProfile()
listActiveOperators()
activateAnchor(input: { anchorDisplayName: string; operatorId: string })
selectOperator(input: { operatorId: string })
updateDisplayName(input: { anchorDisplayName: string })
```

- [ ] **Step 3: 实现激活页**

页面状态：

- 无激活任务：提示联系审核老师。
- 可激活：填写主播展示名，选择运营并提交。
- 待运营确认：显示已选择运营和等待提示。
- 已激活：跳转活动页。

提交按钮必须防重复点击，成功后刷新登录态。

预览／Mock模式沿用现有测试主播数据，并明确标记为已激活，避免开发预览被真实激活任务阻塞。

- [ ] **Step 4: 注册和引导**

在 `app.config.ts` 注册 `pages/activate/index`。登录后未激活时从业务页跳转激活页；不要在React渲染过程中直接调用跳转，使用页面生命周期或事件。

- [ ] **Step 5: 修改我的页面**

展示：

- 企微展示名
- 主播展示名
- 所属运营
- 待确认／已确认状态

- [ ] **Step 6: 构建和提交**

Run:

```bash
npm run build:weapp
```

Expected: 编译成功；现有Tailwind content警告可记录为既有警告，但不能新增编译错误。

```bash
git add miniapp-anchor/src
git commit -m "feat: add anchor profile activation miniapp flow"
```

## 12. Task 10：兼容、回归和阶段验收

**Files:**

- Modify: `README.md`
- Modify: `api/README.md`
- Modify: `.env.example`
- Modify: `miniapp-anchor/.env.example`

- [ ] **Step 1: 更新环境变量说明**

记录：

- 超管初始化账号。
- 企微Web应用配置。
- 企微小程序配置。
- API和前端地址。
- 私钥必须从仓库外路径加载。

不得把真实密钥写入文档或示例。

- [ ] **Step 2: 运行完整验证**

Run:

```bash
npm --prefix api test
npm --prefix api run lint
npm --prefix api run build
npm run build
npm --prefix miniapp-anchor run build:weapp
git diff --check
```

Expected:

- API测试全部通过。
- API类型检查和构建通过。
- Web构建通过。
- 小程序构建通过。
- 无空白错误。

- [ ] **Step 3: 检查原礼物业务回归**

人工或接口验证：

1. 超管密码登录仍可进入原活动管理、规则和导出页面。
2. 运营企微登录后仍可查看自己权限范围内的原活动记录。
3. 主播小程序激活后仍可查看活动和自己的历史记录。
4. 原活动、提报、审核和奖励API路径不被删除。
5. 未激活主播被业务页面拦截，但小程序登录本身成功。

- [ ] **Step 4: 更新README**

写明：

- 三类登录方式。
- 新角色。
- 激活流程。
- 数据库迁移执行方法。
- 本阶段不包含礼物自动归属、岗前里程碑和培训课程。

- [ ] **Step 5: 提交阶段A**

```bash
git add README.md api/README.md .env.example miniapp-anchor/.env.example
git commit -m "docs: document phase a identity workflow"
```

## 13. 阶段A完成定义

只有同时满足以下条件，阶段A才算完成：

- 副本项目拥有独立Git历史，原项目未被修改。
- 超管只能外部账号密码登录。
- 运营、审核和培训人员只能通过预录入企微UID登录。
- 主播只能通过小程序登录。
- 审核老师能创建并跟进激活任务。
- 主播必须本人激活档案并选择运营。
- 运营能确认或驳回归属。
- 一个主播只有一份档案和一个开放运营归属。
- 所有越权操作由后端拒绝。
- Web、API和小程序构建全部通过。
- 现有礼物业务接口和页面保持可用。

阶段A完成后，下一份计划为“阶段B：岗前／首播里程碑与礼物提报自动固定运营”。
