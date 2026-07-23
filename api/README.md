# 主播培训中台 API

NestJS、Prisma和PostgreSQL后端，承载现有礼物业务及新增的主播统一身份。

## 命令

```bash
npm install
npm run test
npm run lint
npm run build
npm run start:dev
```

Prisma结构校验：

```bash
npx prisma format
npx prisma validate
npx prisma generate
```

## 阶段A、B模块

- `auth`：外部超管密码、企微员工、企微小程序三类登录。
- `access`：后端实时角色和账号状态校验。
- `staff`：员工企微UID、多角色和启停。
- `activation`：审核老师创建主播激活任务。
- `anchors`：主播本人激活档案及运营归属确认。
- `onboarding`：运营维护岗前、首播和首播复盘八节点。
- `submissions`：礼物提报从主播档案自动读取固定运营；待确认归属记录隔离处理。

## 登录规则

- `/api/auth/login` 只允许 `super_admin`。
- `/api/auth/wecom/callback` 只允许预录入且启用的企微员工。
- `/api/miniapp/auth/login` 固定返回主播身份。
- 员工账号不创建用户名或密码。
- 超级管理员不通过企微登录。

## 数据库迁移

现有项目使用根目录 `migrations` 保存SQL。首次部署阶段A前：

1. 备份数据库。
2. 确认已经执行旧礼物业务迁移。
3. 执行 `migrations/202607230001_add_identity_and_anchor_profiles.sql`。
4. 执行 `migrations/202607230002_add_onboarding_and_fixed_submission_operator.sql`。
5. 运行 `npx prisma generate`。
6. 启动API并使用测试账号验证三类登录。

正式升级时必须按“备份数据库 → 执行SQL → 部署API → 部署Web → 部署小程序”的顺序进行。迁移前后核对提报总数；本仓库的验证命令只校验Schema，不会连接或修改真实数据库。

不要在生产库上无确认执行整库清理或覆盖。

## 已知依赖事项

- `@nestjs/platform-express` 已更新到包含 Multer 2.2.0 的修复版本。
- 现有礼物系统使用的 `xlsx@0.18.5` 在npm审计中仍有高危告警且无可用修复版本。阶段A不改写既有导出逻辑；进入参会表和导出改造时必须替换为受维护的Excel库，并在替换前限制上传文件大小、来源和处理权限。

## 密钥

`.env`、`.env.local`、`*.pem` 和上传目录均被Git忽略。企微Secret、JWT Secret、数据库密码及后续腾讯会议密钥不得写入代码、README或提交记录。
