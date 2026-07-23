# 礼物收集活动管理系统

当前仓库已经完成基础骨架、企业微信登录第一版接入，以及数据库驱动的运营老师管理最小闭环，包含：

- `src`：React + Vite 前端基础路由骨架
- `api`：NestJS 后端基础模块骨架
- `api/prisma/schema.prisma`：Prisma 数据模型
- `migrations`：初始化 SQL 文件
- `.trae/documents`：产品需求和技术方案文档

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

这一步会完成：

- 生成 Prisma Client
- 把 `schema.prisma` 表结构推送到 PostgreSQL
- 初始化两种活动类型：`礼物收集类`、`PK 值类`

## 环境变量

复制 `.env.example` 为 `.env.local`，补充以下配置：

- PostgreSQL 连接地址
- 企业微信 `CorpID / AgentID / Secret / Callback URL`
- 对象存储配置
- 前端访问后端的 `VITE_API_BASE_URL`

## 当前阶段说明

当前版本主要完成：

- 前端主路由占位
- 后端健康检查与模块骨架
- 企业微信登录与回调
- 数据库结构建模
- 超级管理员运营老师管理最小闭环

下一阶段会继续实现活动管理、规则配置、主播提报、审核发放和通知逻辑。
