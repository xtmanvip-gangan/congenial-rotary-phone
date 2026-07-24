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

## 员工角色编辑补丁

- 部署版本：`d9a00c9`（功能提交：`e3c5afe`）
- 部署时间：2026-07-23（Asia/Shanghai）
- 改为“编辑角色—勾选角色—保存角色”的明确操作流程。
- 同一员工可同时勾选审核老师、运营老师、培训老师和培训管理员。
- 保存后展示成功或失败原因；员工退出当前企微登录后重新登录，即可在顶部工作台切换已分配角色。
- 上线前 Web 备份：`/www/backups/shouji/20260723-roles-e3c5afe/ac.ydwy.net-before-roles.tar.gz`
- 线上静态资源：`index-HnTvFq7i.js`

## 激活任务时间校验补丁

- 部署版本：`8c1149c`
- 部署时间：2026-07-23（Asia/Shanghai）
- 修复入会完成时间或设备调试完成时间为空时，前端执行无效日期转换并中断提交的问题。
- 现在提交前会明确提示填写两个完成时间，不再出现无请求、无反馈的失败。
- 上线前 Web 备份：`/www/backups/shouji/20260723-activation-8c1149c/ac.ydwy.net-before-activation-fix.tar.gz`
- 线上静态资源：`index-o2TA3fno.js`

## 主播一键开通与企微提醒

- 部署版本：`730d384`
- 部署时间：2026-07-23（Asia/Shanghai）
- API release：`/www/wwwroot/shouji-releases/730d384`
- Web 静态资源：`index-BOV3p7gM.js`
- 小程序编译产物：`miniapp-anchor/dist`
- 上线前备份：`/www/backups/shouji/20260723-211523-before-one-click-activation`
- 数据库迁移：`202607230006_anchor_one_click_activation.sql`

本次上线内容：

- 审核老师创建档案开通任务时预填主播昵称、企微 UID、固定运营和入会时间。
- 移除设备调试时间；主播不能在小程序中填写昵称或选择运营。
- 审核老师可在主播开通前编辑资料，并在运营驳回后重新分配运营。
- “发送提醒”改为人工触发，并正式复用企业微信自建应用消息通道；仅实际发送成功时累计提醒次数。
- 主播小程序只读展示主播昵称、所属运营和入会时间，主播本人一键开通档案。
- 保留运营确认归属和后续八个岗前孵化节点。

迁移和验证结果：

- 数据库副本迁移演练成功，迁移前后激活任务均为 1 条。
- 正式库迁移已写入 `deployment_migrations`。
- `operator_id` 字段及外键已建立，`device_ready_at` 已删除。
- 现有 1 条旧激活任务未分配运营，需审核老师在页面中编辑并补选运营后再发送提醒。
- 本地 Web 2 项测试通过；API 23 个测试文件、67 项测试通过。
- 服务器 API 23 个测试文件、67 项测试通过，构建成功。
- Web、小程序生产构建成功；小程序 `app.json` 与 `project.config.json` 均已生成。
- `https://ac.ydwy.net/api/health` 返回成功；PM2 新进程在线、重启次数为 0、错误日志为空。
- 未登录访问激活任务接口返回 401。
- 实际企微提醒未自动发送，需由审核老师补全旧任务运营后点击“发送提醒”完成真实账号验收。

## 手工腾讯会议 + 固定运营对齐（2026-07-24）

- 部署版本：`d9814b7`（后续细节优化可能叠加提交）
- API release：`/www/wwwroot/shouji-releases/d9814b7`
- Web 静态资源：`index-DmWe5l7S.js`（及后续构建哈希）
- 上线前备份：`/www/backups/shouji/20260723-220810-before-manual-meeting`
- 变更摘要：
  - 培训场次发布不再调用腾讯会议 API；支持后补会议号与入会链接。
  - 参会以腾讯导出 Excel（含观看时长表头）导入为主路径，≥80% 自动已学。
  - Web 主播提报与小程序对齐：固定运营只读，不可自选。
- 定时任务仍需在服务器 crontab 按 `scripts/cron-training-jobs.example` 接入。
