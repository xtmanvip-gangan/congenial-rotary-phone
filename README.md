# 主播培训中台与礼物收集系统

本仓库是在礼物收集活动管理系统副本上扩展的公司内部主播培训中台。

- `src`：React + Vite 前端基础路由骨架
- `api`：NestJS 后端基础模块骨架
- `api/prisma/schema.prisma`：Prisma 数据模型
- `migrations`：初始化 SQL 文件
- `.trae/documents`：产品需求和技术方案文档
- `docs/superpowers/plans`：分阶段实施计划

## 开发命令

先安装根目录依赖：

```bash
npm install
```

再安装后端依赖：

```bash
cd api
npm install
```

启动前端：

```bash
npm run dev
```

启动后端：

```bash
npm run dev:api
```

## 数据库初始化

先把根目录 `.env.local` 里的 `DATABASE_URL` 配好，然后执行：

```bash
cd api
npm run prisma:generate
npm run db:push
npm run db:seed:activity-types
```

初始化已有礼物业务后，再按顺序执行 `migrations` 目录中的增量SQL。阶段A新增：

- `staff_role_assignments`
- `anchor_activation_tasks`
- `anchor_profiles`
- `anchor_name_history`
- `anchor_operator_assignments`

阶段B继续执行：

- `migrations/202607230002_add_onboarding_and_fixed_submission_operator.sql`

该迁移新增主播岗前进度、首播与复盘节点，并为礼物提报补充主播档案、运营归属和姓名快照。既有提报自动保留为“归属已确认”，不会要求重新选择运营。

阶段C继续执行：

- `migrations/202607230003_add_training_core.sql`

该迁移新增课程、资料链接、固定排课模板、培训场次、报名候补和课程级学习进度，并初始化课程1—7。

阶段D继续执行：

- `migrations/202607230004_add_training_integrations.sql`

该迁移新增腾讯会议、参会原始记录与人工审计、通用通知关联、课程推荐、运营应用反馈、问题池和周沟通会。`notification_logs.submission_id` 改为可空，但现有礼物通知关系继续兼容。

生产环境不要使用无确认的整库 `db:push` 替代增量迁移。

## 环境变量

复制 `.env.example` 为 `.env.local`，补充以下配置：

- PostgreSQL 连接地址
- 企业微信 `CorpID / AgentID / Secret / Callback URL`
- 企业微信小程序 `CorpID / Secret`
- 超级管理员初始化账号
- 对象存储配置
- 前端访问后端的 `VITE_API_BASE_URL`
- 腾讯会议开放平台 `AppID / SDKID / SecretID / SecretKey`
- 培训中心固定腾讯会议账号的企业 `userid`

真实密钥、私钥文件和密码只能放在部署环境变量或仓库外的受控位置，不能提交到Git。

## 三类登录

- 超级管理员：只能在外部浏览器使用账号密码登录。
- 审核、运营和培训人员：只能从企业微信自建应用进入，通过预录入的企微UID识别。
- 主播：只能通过企业微信小程序授权登录。

## 阶段A—E已完成

- 员工多角色和登录入口隔离。
- 审核老师创建、提醒和跟进主播激活任务。
- 主播本人通过企微身份激活唯一档案。
- 主播选择运营，运营确认或驳回。
- 固定运营归属和归属历史数据基础。
- 超管员工管理、审核激活和运营主播Web工作台。
- 主播小程序激活页面。
- 运营确认归属后自动生成八个岗前、首播和复盘节点。
- 运营Web工作台逐项落地和记录主播孵化进度。
- 礼物提报由服务端自动带出固定运营，客户端不能伪造或修改归属。
- 待确认归属的礼物提报只保存，不进入审核、通知、奖励和统计。
- 主播小程序只读展示主播档案名和固定运营。
- 培训课程1—7及飞书资料链接管理。
- 每周固定排课模板、下周草稿、临时场次、发布、改期、开始和结束。
- 主播本人报名、候补、开课前取消和自动补位。
- 运营为自己已确认归属主播单人或批量代报名及取消。
- 培训老师维护报名名单、已学习和待补学结论。
- 主播小程序培训课表、报名状态和个人课程进度。
- 发布场次自动创建独立腾讯会议，失败状态可重试且不发送无效入口。
- 腾讯会议参会记录分页同步、多段时长合并、80%自动完成和同名人工确认。
- Excel参会表上传预览、冲突处理、确认和文件哈希幂等。
- 通用企业微信通知日志、报名/候补/补位/取消/提醒/参会结论通知和失败重试。
- 新主播课程1—3、后续课程4—7系统推荐，以及运营和培训老师人工推荐。
- 运营每周应用反馈、随时问题提报、培训中心问题分类和周沟通会。
- 主播小程序新增“推荐课程”，Web新增参会处理和培训运营工作台。
阶段 E 增加按角色限定数据范围的工作台、任务运行监控、企微/腾讯会议异常中心、超管密码登录限流和参会 Excel 文件签名校验。生产上线、备份、清理预览与回退步骤见 [阶段 E 上线与回退手册](docs/deployment/phase-e-launch-runbook.md)。
