# ac.ydwy.net 阶段 A—E 测试环境部署记录

## 部署结果

- 部署时间：2026-07-23（Asia/Shanghai）
- 测试域名：`https://ac.ydwy.net`
- 服务器：`124.222.105.233`
- 有效代码版本：`e3fcdb0`
- 服务器 release：`/www/wwwroot/shouji-releases/3f8d96a`
- 当前 release 链接：`/www/wwwroot/shouji-current`
- Web 静态目录：`/www/wwwroot/ac.ydwy.net`
- API PM2 进程：`shouji-api-test`
- API 地址：`127.0.0.1:3011`

服务器 release 目录名沿用首次完整构建版本；后续已同步兼容迁移、服务器 npm 锁文件和生产 API 回环监听修复，对应本地提交 `e3fcdb0`。

## 回退点

服务器回退目录：

`/www/backups/shouji/20260723-1955-before-phase-e`

目录包含：

- `shouji.dump`：迁移前 PostgreSQL 自定义格式备份。
- `ac.ydwy.net.tar.gz`：迁移前 Web 静态文件。
- `shouji-test-source.tar.gz`：迁移前 API 与旧项目源码，不包含 `node_modules`。
- `ac.ydwy.net.conf` 和 `nginx-proxy/`：Nginx 配置。
- `shouji-phase-e-e3fcdb0.tar.gz`：最终部署源码归档。
- `SHA256SUMS`：备份校验值。

## 数据库迁移

已应用并记录在 `deployment_migrations`：

1. `202607130001_add_reward_value_cents.sql`
2. `202607230001_add_identity_and_anchor_profiles.sql`
3. `202607230002_add_onboarding_and_fixed_submission_operator.sql`
4. `202607230003_add_training_core.sql`
5. `202607230004_add_training_integrations.sql`
6. `202607230005_add_operations_monitoring.sql`

迁移先在数据库副本演练，再应用到测试库。演练数据库已删除。

迁移后核对：

- 原活动：2
- 原礼物提报：7
- 现有员工角色：9
- 培训课程：7
- 培训相关表：17
- 运维相关表：3

## 验证结果

- 公开首页与 `/api/health` 返回 200。
- 未登录访问管理看板返回 401。
- 超级管理员密码登录成功。
- `/api/dashboard`、`/api/staff`、`/api/training/courses`、`/api/operations/job-runs` 和 `/api/activities` 返回 200。
- Web 构建包含培训中心、任务与异常、主播激活和首播复盘功能。
- 服务器 API：23 个测试文件、64 个测试通过。
- API 类型检查和构建通过。
- PM2 进程在线，无异常重启，错误日志为空。
- 生产 API 只监听 `127.0.0.1:3011`，外网不能绕过 Nginx 直接访问 3011。
- CORS 只允许 `https://ac.ydwy.net`，安全响应头已生效。

## 尚待配置

- 企业微信 Web 与小程序配置已存在，回调域名为 `ac.ydwy.net`。
- 腾讯会议的 `APP_ID`、`SECRET_ID`、`SECRET_KEY` 和固定账号 `USER_ID` 尚未注入服务器。
- 培训定时任务尚未接入系统调度器。
- 尚未使用真实员工与主播完成企微端到端登录、通知、报名、参会和首播闭环。
