# 主播档案一键开通与企微提醒 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让审核老师预填主播档案资料并手动发送企微提醒，主播在小程序核对资料后一键开通，运营确认后进入岗前孵化。

**Architecture:** 以 `AnchorActivationTask` 作为开通前唯一资料来源，新增任务固定运营并移除设备调试时间。通知复用现有 `NotificationsService`，主播开通接口只读取当前企微身份和任务快照，不接受客户端提交的昵称或运营。

**Tech Stack:** PostgreSQL、Prisma、NestJS、Vitest、React、TanStack Query、Taro React、企业微信自建应用消息 API、微信开发者工具。

---

## 文件结构

- `migrations/202607230006_anchor_one_click_activation.sql`：保留旧数据的数据库增量迁移。
- `api/prisma/schema.prisma`：激活任务的运营关联和设备时间删除。
- `api/src/modules/activation/dto/*.ts`：创建、编辑和重新分配输入边界。
- `api/src/modules/activation/activation.service.ts`：任务创建、编辑、提醒和重新分配。
- `api/src/modules/activation/activation.controller.ts`：审核端任务接口。
- `api/src/modules/activation/activation.service.spec.ts`：激活任务与企微提醒回归测试。
- `api/src/modules/anchors/anchors.service.ts`：主播读取待开通资料及一键开通事务。
- `api/src/modules/anchors/anchors.controller.ts`：主播端任务预览和一键开通接口。
- `api/src/modules/anchors/anchors.service.spec.ts`：一键开通与幂等测试。
- `src/pages/AuditActivationPage.tsx`：审核端创建、编辑、提醒和重新分配界面。
- `src/pages/AuditActivationPage.test.tsx`：Web 交互回归测试。
- `miniapp-anchor/src/services/anchors.ts`：无参数一键开通与任务预览请求。
- `miniapp-anchor/src/types/anchor.ts`：开通预览类型。
- `miniapp-anchor/src/pages/activate/index.tsx`：只读确认卡和单按钮开通页。
- `docs/deployment/2026-07-23-ac-deployment-record.md`：迁移、备份、版本和验收记录。

### Task 1: 数据库迁移与 Prisma 模型

**Files:**
- Create: `migrations/202607230006_anchor_one_click_activation.sql`
- Modify: `api/prisma/schema.prisma`

- [ ] **Step 1: 编写增量迁移**

```sql
ALTER TABLE anchor_activation_tasks
  ADD COLUMN operator_id uuid;

UPDATE anchor_activation_tasks AS task
SET operator_id = profile.current_operator_id
FROM anchor_profiles AS profile
WHERE task.activated_anchor_profile_id = profile.id
  AND profile.current_operator_id IS NOT NULL;

ALTER TABLE anchor_activation_tasks
  ADD CONSTRAINT anchor_activation_tasks_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES operator_accounts(id);

CREATE INDEX anchor_activation_tasks_operator_id_idx
  ON anchor_activation_tasks(operator_id);

ALTER TABLE anchor_activation_tasks
  DROP COLUMN device_ready_at;
```

- [ ] **Step 2: 修改 Prisma 关系**

```prisma
model OperatorAccount {
  assignedActivationTasks AnchorActivationTask[] @relation("ActivationAssignedOperator")
}

model AnchorActivationTask {
  operatorId       String?          @map("operator_id") @db.Uuid
  operator         OperatorAccount? @relation("ActivationAssignedOperator", fields: [operatorId], references: [id])
  membershipCompletedAt DateTime    @map("membership_completed_at")

  @@index([operatorId])
}
```

删除 `deviceReadyAt`。

- [ ] **Step 3: 生成 Prisma 客户端并验证 schema**

Run: `npm --prefix api run prisma:generate && npm --prefix api run build`

Expected: Prisma Client 生成成功，Nest 构建退出码为 0。

- [ ] **Step 4: 提交**

```bash
git add migrations/202607230006_anchor_one_click_activation.sql api/prisma/schema.prisma
git commit -m "feat: migrate activation tasks to assigned operators"
```

### Task 2: 审核端任务创建与编辑

**Files:**
- Modify: `api/src/modules/activation/dto/create-activation-task.dto.ts`
- Create: `api/src/modules/activation/dto/update-activation-task.dto.ts`
- Create: `api/src/modules/activation/dto/reassign-activation-operator.dto.ts`
- Modify: `api/src/modules/activation/activation.service.spec.ts`
- Modify: `api/src/modules/activation/activation.service.ts`
- Modify: `api/src/modules/activation/activation.controller.ts`

- [ ] **Step 1: 写创建与编辑失败测试**

```ts
it('creates a task with the audit-assigned operator and no device time', async () => {
  await service.create(auditTeacher, {
    expectedWecomUserId: 'anchor-uid',
    wecomDisplayName: '主播小鹿',
    operatorId: 'operator-1',
    membershipCompletedAt: '2026-07-23T09:00:00.000Z',
  })

  expect(prisma.anchorActivationTask.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      expectedWecomUserId: 'anchor-uid',
      operatorId: 'operator-1',
      membershipCompletedAt: new Date('2026-07-23T09:00:00.000Z'),
    }),
    include: expect.any(Object),
  })
})

it('updates all task snapshots before activation', async () => {
  await service.update(auditTeacher, 'task-1', {
    expectedWecomUserId: 'anchor-new',
    wecomDisplayName: '主播新昵称',
    operatorId: 'operator-2',
    membershipCompletedAt: '2026-07-23T10:00:00.000Z',
  })

  expect(prisma.anchorActivationTask.update).toHaveBeenCalledWith({
    where: { id: 'task-1' },
    data: expect.objectContaining({ operatorId: 'operator-2' }),
    include: expect.any(Object),
  })
})

it('reassigns an activated profile after an operator rejection', async () => {
  await service.reassignOperator(auditTeacher, 'task-1', 'operator-2')

  expect(prisma.anchorOperatorAssignment.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      anchorProfileId: 'profile-1',
      operatorId: 'operator-2',
      status: 'pending_confirmation',
    }),
  })
  expect(prisma.anchorProfile.update).toHaveBeenCalledWith({
    where: { id: 'profile-1' },
    data: {
      currentOperatorId: 'operator-2',
      assignmentStatus: 'pending_confirmation',
    },
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix api test -- activation.service.spec.ts`

Expected: FAIL，创建 DTO 仍要求 `deviceReadyAt`，且 `update` 不存在。

- [ ] **Step 3: 实现 DTO 和接口**

```ts
export class CreateActivationTaskDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  expectedWecomUserId!: string

  @IsString() @IsNotEmpty() @MaxLength(100)
  wecomDisplayName!: string

  @IsUUID()
  operatorId!: string

  @IsDateString()
  membershipCompletedAt!: string
}

export class UpdateActivationTaskDto extends CreateActivationTaskDto {}

export class ReassignActivationOperatorDto {
  @IsUUID()
  operatorId!: string
}
```

控制器新增：

```ts
@Patch(':taskId')
update(
  @Headers('authorization') authorization: string | undefined,
  @Param('taskId') taskId: string,
  @Body() dto: UpdateActivationTaskDto,
) {
  return this.activationService.update(
    this.authService.getCurrentUserFromAuthHeader(authorization),
    taskId,
    dto,
  )
}

@Post(':taskId/reassign-operator')
reassignOperator(
  @Headers('authorization') authorization: string | undefined,
  @Param('taskId') taskId: string,
  @Body() dto: ReassignActivationOperatorDto,
) {
  return this.activationService.reassignOperator(
    this.authService.getCurrentUserFromAuthHeader(authorization),
    taskId,
    dto.operatorId,
  )
}
```

服务层创建和编辑前必须查询：

```ts
const operator = await this.prisma.operatorAccount.findFirst({
  where: {
    id: dto.operatorId,
    status: 'active',
    staffRoles: { some: { role: 'operator' } },
  },
  select: { id: true, displayName: true },
})
if (!operator) throw new BadRequestException('所选运营老师当前不可用')
```

编辑只允许 `pending`、`invited` 或 `cancelled` 且未关联主播档案的任务。

重新分配只允许任务已经关联主播档案、且档案 `assignmentStatus` 为 `rejected`。事务内创建新的 `pending_confirmation` 归属记录，并更新档案和任务的 `operatorId`。

- [ ] **Step 4: 运行测试**

Run: `npm --prefix api test -- activation.service.spec.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add api/src/modules/activation
git commit -m "feat: let audit teachers manage activation snapshots"
```

### Task 3: 正式企微提醒

**Files:**
- Modify: `api/src/modules/activation/activation.module.ts`
- Modify: `api/src/modules/activation/activation.service.spec.ts`
- Modify: `api/src/modules/activation/activation.service.ts`

- [ ] **Step 1: 写提醒成功与失败测试**

```ts
it('increments reminder data only after WeCom delivery succeeds', async () => {
  notifications.sendBusinessNotification.mockResolvedValue({
    item: { id: 'notice-1', status: 'success' },
    duplicate: false,
  })

  const result = await service.sendInvitation(auditTeacher, 'task-1')

  expect(notifications.sendBusinessNotification).toHaveBeenCalledWith(
    expect.objectContaining({
      businessType: 'anchor_activation',
      businessId: 'task-1',
      receiverWecomUserId: 'anchor-uid',
      receiverRole: 'anchor',
      templateCode: 'anchor_activation_invitation',
    }),
  )
  expect(result.notificationStatus).toBe('success')
  expect(prisma.anchorActivationTask.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        status: 'invited',
        invitationCount: { increment: 1 },
      }),
    }),
  )
})

it('keeps reminder counters unchanged when WeCom delivery fails', async () => {
  notifications.sendBusinessNotification.mockResolvedValue({
    item: { id: 'notice-1', status: 'failed', errorMessage: '企微接口失败' },
    duplicate: false,
  })

  const result = await service.sendInvitation(auditTeacher, 'task-1')

  expect(result).toEqual({
    notificationStatus: 'failed',
    errorMessage: '企微接口失败',
  })
  expect(prisma.anchorActivationTask.update).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix api test -- activation.service.spec.ts`

Expected: FAIL，现有实现固定返回 `not_configured`。

- [ ] **Step 3: 注入通知服务并发送**

```ts
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ActivationController],
  providers: [ActivationService],
})
export class ActivationModule {}
```

消息内容：

```ts
const messageContent = [
  `主播：${task.wecomDisplayNameSnapshot}`,
  `所属运营：${task.operator.displayName}`,
  `入会时间：${task.membershipCompletedAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
  '请打开主播小程序，核对资料后完成档案开通。',
].join('\n')
```

调用：

```ts
await this.notifications.sendBusinessNotification({
  businessType: 'anchor_activation',
  businessId: task.id,
  templateCode: 'anchor_activation_invitation',
  receiverWecomUserId: task.expectedWecomUserId,
  receiverRole: 'anchor',
  messageTitle: '【悦总统】主播档案开通提醒',
  messageContent,
})
```

发送后重新读取通知日志状态；只有 `success` 才更新任务提醒次数、时间和 `invited` 状态。

- [ ] **Step 4: 运行通知和激活测试**

Run: `npm --prefix api test -- activation.service.spec.ts notifications.service.spec.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add api/src/modules/activation
git commit -m "feat: send activation reminders through WeCom"
```

### Task 4: 主播一键开通 API

**Files:**
- Modify: `api/src/modules/anchors/dto/activate-anchor.dto.ts`
- Modify: `api/src/modules/anchors/anchors.service.spec.ts`
- Modify: `api/src/modules/anchors/anchors.service.ts`
- Modify: `api/src/modules/anchors/anchors.controller.ts`

- [ ] **Step 1: 写预览和一键开通失败测试**

```ts
it('previews only the current anchor task snapshot', async () => {
  const result = await service.getMyActivation(anchorUser)
  expect(result.item).toEqual({
    anchorDisplayName: '主播小鹿',
    membershipCompletedAt: '2026-07-23T09:00:00.000Z',
    operator: { id: 'operator-1', displayName: '运营甲' },
  })
})

it('activates from the task snapshot without client profile fields', async () => {
  await service.activate(anchorUser)
  expect(anchorProfileCreate).toHaveBeenCalledWith({
    data: expect.objectContaining({
      anchorDisplayName: '主播小鹿',
      currentOperatorId: 'operator-1',
      assignmentStatus: 'pending_confirmation',
    }),
    include: expect.any(Object),
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix api test -- anchors.service.spec.ts`

Expected: FAIL，现有 `activate` 要求昵称和运营参数。

- [ ] **Step 3: 实现预览和无参数开通**

控制器：

```ts
@Get('me/activation')
activation(@Headers('authorization') authorization?: string) {
  return this.anchorsService.getMyActivation(
    this.authService.getCurrentUserFromAuthHeader(authorization),
  )
}

@Post('activate')
activate(@Headers('authorization') authorization?: string) {
  return this.anchorsService.activate(
    this.authService.getCurrentUserFromAuthHeader(authorization),
  )
}
```

`activate` 事务只读取企微 UID 对应任务的昵称和运营。删除 `ActivateAnchorDto` 字段，或把控制器 `@Body()` 完全移除。已有档案直接返回，保持幂等。

- [ ] **Step 4: 删除主播自主选择运营路径**

删除小程序对 `/anchors/me/operator-selection` 的调用。后端保留接口仅用于兼容时必须拒绝主播自主改运营并提示联系审核老师；审核重新分配由激活服务专用接口完成。

- [ ] **Step 5: 保留运营确认与八个岗前节点回归**

```ts
it('initializes all eight onboarding milestones after operator confirmation', async () => {
  await service.confirmAssignment(operatorUser, 'assignment-1')
  expect(prisma.anchorOnboardingProgress.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        milestones: {
          create: expect.arrayContaining([
            expect.objectContaining({ type: 'operator_received', status: 'completed' }),
            expect.objectContaining({ type: 'first_live_review_completed', status: 'pending' }),
          ]),
        },
      }),
    }),
  )
})
```

- [ ] **Step 6: 运行测试**

Run: `npm --prefix api test -- anchors.service.spec.ts`

Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add api/src/modules/anchors
git commit -m "feat: activate anchor profiles from audit snapshots"
```

### Task 5: 审核端 Web

**Files:**
- Modify: `src/pages/AuditActivationPage.test.tsx`
- Modify: `src/pages/AuditActivationPage.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
it('creates a task with an assigned operator and no device time', async () => {
  renderPage()
  expect(screen.queryByLabelText('设备调试完成时间')).toBeNull()
  fireEvent.change(screen.getByLabelText('主播昵称'), {
    target: { value: '主播小鹿' },
  })
  fireEvent.change(screen.getByLabelText('企微UID'), {
    target: { value: 'anchor-uid' },
  })
  fireEvent.change(screen.getByLabelText('分配运营'), {
    target: { value: 'operator-1' },
  })
  fireEvent.change(screen.getByLabelText('入会时间'), {
    target: { value: '2026-07-23T09:00' },
  })
  fireEvent.click(screen.getByRole('button', { name: '创建档案开通任务' }))
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/activation-tasks',
    expect.objectContaining({
      body: expect.stringContaining('"operatorId":"operator-1"'),
    }),
  )
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:web -- src/pages/AuditActivationPage.test.tsx`

Expected: FAIL，页面仍显示设备时间且没有运营选择。

- [ ] **Step 3: 实现创建、编辑和提醒反馈**

页面加载 `/staff/operators/active`。表单字段为昵称、UID、运营和入会时间。任务卡增加“编辑资料”和“发送提醒／重新发送提醒”。

提醒结果根据接口显示：

```ts
setMessage(
  result.notificationStatus === 'success'
    ? '企微提醒已发送'
    : `企微提醒发送失败：${result.errorMessage || '未知错误'}`,
)
```

已开通任务隐藏编辑和取消；归属被驳回时显示“重新分配运营”。

- [ ] **Step 4: 运行 Web 测试和构建**

Run: `npm run test:web && npm run build:web`

Expected: Web 测试全部 PASS，Vite 构建成功。

- [ ] **Step 5: 提交**

```bash
git add src/pages/AuditActivationPage.tsx src/pages/AuditActivationPage.test.tsx
git commit -m "feat: manage activation assignments from audit workspace"
```

### Task 6: 主播小程序只读确认与一键开通

**Files:**
- Modify: `miniapp-anchor/src/services/anchors.ts`
- Modify: `miniapp-anchor/src/types/anchor.ts`
- Modify: `miniapp-anchor/src/pages/activate/index.tsx`

- [ ] **Step 1: 修改服务契约**

```ts
export type AnchorActivationPreview = {
  anchorDisplayName: string
  membershipCompletedAt: string
  operator: OperatorOption
}

export function getMyActivation() {
  return requestJson<{ item: AnchorActivationPreview | null }>(
    '/anchors/me/activation',
  )
}

export function activateAnchor() {
  return requestJson<{ item: AnchorProfile }>('/anchors/activate', {
    method: 'POST',
  })
}
```

删除激活页对 `listActiveOperators` 和 `selectOperator` 的依赖。

- [ ] **Step 2: 实现只读确认卡**

```tsx
<View className="panelCard">
  <Text className="fieldLabel">主播昵称</Text>
  <View className="fieldValue">{preview.anchorDisplayName}</View>
  <Text className="fieldLabel">所属运营</Text>
  <View className="fieldValue">{preview.operator.displayName}</View>
  <Text className="fieldLabel">入会时间</Text>
  <View className="fieldValue">
    {dayjs(preview.membershipCompletedAt).format('YYYY-MM-DD HH:mm')}
  </View>
  <Button className="primaryButton" onClick={() => void submitActivation()}>
    确认并开通档案
  </Button>
</View>
```

`submitActivation()` 无参数调用 `activateAnchor()`。

归属驳回状态只显示联系审核老师和刷新按钮，不显示运营选择器。

- [ ] **Step 3: 类型检查并构建微信小程序**

Run: `npm --prefix miniapp-anchor run build:weapp`

Expected: 构建成功，产物存在于 `miniapp-anchor/dist`。

- [ ] **Step 4: 检查构建配置**

Run: `test -f miniapp-anchor/dist/app.json && test -f miniapp-anchor/dist/project.config.json`

Expected: 两个文件均存在，退出码为 0。

- [ ] **Step 5: 提交**

```bash
git add miniapp-anchor/src
git commit -m "feat: build one-click anchor activation miniapp"
```

`miniapp-anchor/dist` 是本地编译交付物，不纳入源码提交。

### Task 7: 完整验证、迁移和服务器部署

**Files:**
- Modify: `docs/deployment/2026-07-23-ac-deployment-record.md`

- [ ] **Step 1: 本地完整验证**

Run:

```bash
npm run test:web
npm --prefix api test -- --run
npm run check
npm run build:web
npm --prefix miniapp-anchor run build:weapp
git diff --check
```

Expected: Web、API 全部测试通过；Web、API、小程序构建退出码均为 0。

- [ ] **Step 2: 服务器备份**

在 `/www/backups/shouji/<timestamp>-before-one-click-activation` 保存：

```bash
pg_dump -Fc shouji > shouji.dump
tar -czf ac.ydwy.net.tar.gz -C /www/wwwroot/ac.ydwy.net .
tar -czf shouji-api-source.tar.gz -C /www/wwwroot/shouji-current api
```

Expected: 三个备份文件非空，并记录 SHA256。

- [ ] **Step 3: 在数据库副本演练迁移**

创建临时数据库，恢复 `shouji.dump`，执行 `202607230006_anchor_one_click_activation.sql`，再运行：

```sql
SELECT COUNT(*) FROM anchor_activation_tasks;
SELECT COUNT(*) FROM anchor_activation_tasks WHERE operator_id IS NULL;
```

Expected: 任务总数与迁移前一致；缺运营任务数量被记录用于审核端补充。

- [ ] **Step 4: 应用正式测试库迁移**

把迁移写入 `deployment_migrations`，只执行一次。运行 Prisma 结构核对并确认 `device_ready_at` 已删除、`operator_id` 已建立外键。

- [ ] **Step 5: 发布 API 和 Web**

同步代码到 `/www/wwwroot/shouji-current`，在服务器安装锁定依赖、生成 Prisma 客户端、构建 API，使用 `pm2 restart shouji-api-test --update-env`。同步本地 `dist/` 到 `/www/wwwroot/ac.ydwy.net`，保留 `.user.ini`。

- [ ] **Step 6: 线上验收**

验证：

```bash
curl -fsS https://ac.ydwy.net/api/health
pm2 pid shouji-api-test
```

再用实际审核账号完成：创建任务、编辑任务、发送企微提醒；用开发版小程序完成一键开通；用运营账号确认归属。

- [ ] **Step 7: 更新部署记录并提交**

记录迁移、代码版本、静态资源、备份目录、小程序产物目录和实际企微发送结果。

```bash
git add docs/deployment/2026-07-23-ac-deployment-record.md
git commit -m "docs: record one-click activation deployment"
```
