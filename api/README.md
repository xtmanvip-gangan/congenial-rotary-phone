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

## 阶段A—D模块

- `auth`：外部超管密码、企微员工、企微小程序三类登录。
- `access`：后端实时角色和账号状态校验。
- `staff`：员工企微UID、多角色和启停。
- `activation`：审核老师创建主播激活任务。
- `anchors`：主播本人激活档案及运营归属确认。
- `onboarding`：运营维护岗前、首播和首播复盘八节点。
- `submissions`：礼物提报从主播档案自动读取固定运营；待确认归属记录隔离处理。
- `training`：课程、资料、排课模板、场次、腾讯会议、参会导入、报名候补、学习进度、推荐、反馈、问题池和周会。
- `jobs`：一小时开课提醒和失败通知重试的幂等任务入口。

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
5. 执行 `migrations/202607230003_add_training_core.sql`。
6. 执行 `migrations/202607230004_add_training_integrations.sql`。
7. 运行 `npx prisma generate`。
8. 启动API并使用测试账号验证三类登录。

正式升级时必须按“备份数据库 → 执行SQL → 部署API → 部署Web → 部署小程序”的顺序进行。迁移前后核对提报总数；本仓库的验证命令只校验Schema，不会连接或修改真实数据库。

阶段D发布场次时通过独立适配层创建腾讯会议。缺少腾讯会议配置或接口失败时场次进入 `publish_failed`，不会发送无效入口；补齐配置后可以在场次页重试。

不要在生产库上无确认执行整库清理或覆盖。

## Excel参会表

- 仅允许培训老师、培训管理员和外部浏览器密码登录的超级管理员导入。
- 仅支持 `.xlsx`，单个文件不超过5MB。
- 至少包含“成员名称”以及“参会时长”，或“入会时间 + 离会时间”。
- 系统先预览可匹配、同名冲突和未匹配数量，人工确认后才写入参会与学习结论。
- 同一场次重复上传完全相同的文件按SHA-256幂等处理。

## 幂等任务入口

- `POST /api/jobs/training/send-one-hour-reminders`
- `POST /api/jobs/training/retry-failed-notifications`

两个入口只允许培训管理员或超级管理员调用。生产环境可由公司现有调度器每5—10分钟调用；重复执行由通知 `dedupeKey` 防重。阶段D没有在进程内启动无状态定时器。

## 已知依赖事项

- `@nestjs/platform-express` 已更新到包含 Multer 2.2.0 的修复版本。
- 礼物导出和参会导入已统一改用 ExcelJS；通过 `uuid >= 11.1.1` 覆盖修复其旧版传递依赖。当前 `npm audit --omit=dev` 为0个漏洞。

## 密钥

`.env`、`.env.local`、`*.pem` 和上传目录均被Git忽略。企微Secret、JWT Secret、数据库密码及腾讯会议密钥不得写入代码、README或提交记录。

腾讯会议配置项：

- `TENCENT_MEETING_APP_ID`
- `TENCENT_MEETING_SDK_ID`（应用分配了SDK ID时必填）
- `TENCENT_MEETING_SECRET_ID`
- `TENCENT_MEETING_SECRET_KEY`
- `TENCENT_MEETING_USER_ID`（培训中心固定会议账号的企业 userid）

接口使用企业自建应用签名，请求头包含 `X-TC-Registered: 1`。联调前先在腾讯会议官方调试工具确认固定账号具备创建会议和读取参会记录权限。
