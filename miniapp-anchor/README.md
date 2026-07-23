# 企业微信小程序联调说明

## 1. 后端配置

后端沿用主项目根目录 `.env` 的企业微信配置，至少需要下面这些值：

```env
WECOM_CORP_ID=
WECOM_AGENT_ID=
WECOM_AGENT_SECRET=
JWT_SECRET=
```

说明：

- `WECOM_AGENT_SECRET` 需要使用和小程序绑定的那个企业微信应用密钥。
- 小程序登录接口走的是 `POST /api/miniapp/auth/login`。
- 后端会继续复用现有主播身份体系，返回统一业务登录态。

## 2. 小程序配置

在 `miniapp-anchor` 目录下新建 `.env` 或按环境新建 `.env.development` / `.env.production`：

```env
TARO_APP_API_BASE_URL=https://ac.ydwy.net/api
```

如果是本地联调，可以改成自己的后端地址，例如：

```env
TARO_APP_API_BASE_URL=http://127.0.0.1:3000/api
```

## 3. 小程序 AppID

需要把下面两个文件里的 `appid` 从 `touristappid` 改成真实小程序 AppID：

- `project.config.json`
- `project.tt.json`

## 4. 当前登录策略

- 企业微信小程序环境：优先调用 `wx.qy.login`，再请求后端换业务登录态。
- 非企业微信小程序环境：自动进入预览模式，使用 mock 数据展示页面。

## 5. 当前已打通页面

- 活动列表
- 我的记录
- 记录详情
- 活动提报 / 驳回重提

## 6. 联调重点

- 检查 `wx.qy.login` 是否能返回 `code`
- 检查后端 `miniapp/auth/login` 是否能返回 token 和主播身份
- 检查提报页上传截图、奖励预览、重新提报是否正常
