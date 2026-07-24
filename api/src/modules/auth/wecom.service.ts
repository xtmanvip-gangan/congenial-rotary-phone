import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

type AccessTokenResponse = {
  errcode: number
  errmsg: string
  access_token?: string
  expires_in?: number
}

type SendMessageResponse = {
  errcode: number
  errmsg: string
  invaliduser?: string
}

type GetUserInfoResponse = {
  errcode: number
  errmsg: string
  userid?: string
  openid?: string
  external_userid?: string
  user_ticket?: string
  UserId?: string
  OpenId?: string
}

type GetUserProfileResponse = {
  errcode: number
  errmsg: string
  userid?: string
  name?: string
  avatar?: string
}

type MiniappCode2SessionResponse = {
  errcode: number
  errmsg: string
  corpid?: string
  userid?: string
  session_key?: string
}

type WecomUserProfile = {
  userId: string
  name: string
  avatarUrl: string | null
}

@Injectable()
export class WecomService {
  private cachedAgentAccessToken: { value: string; expiresAt: number } | null = null
  private cachedMiniappAccessToken: { value: string; expiresAt: number } | null = null
  private readonly logger = new Logger(WecomService.name)

  constructor(private readonly configService: ConfigService) {}

  buildAuthorizeUrl(state = 'wecom-login') {
    const corpId = this.getRequiredConfig('WECOM_CORP_ID')
    const agentId = this.getRequiredConfig('WECOM_AGENT_ID')
    const callbackUrl = this.getRequiredConfig('WECOM_CALLBACK_URL')

    const params = new URLSearchParams({
      appid: corpId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'snsapi_base',
      agentid: agentId,
      state,
    })

    return `https://open.weixin.qq.com/connect/oauth2/authorize?${params.toString()}#wechat_redirect`
  }

  async resolveUserProfileByCode(code: string) {
    const token = await this.getAgentAccessToken()
    const identity = await this.fetchWecomJson<GetUserInfoResponse>(
      `https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo?access_token=${encodeURIComponent(token)}&code=${encodeURIComponent(code)}`,
    )

    const memberUserId = identity.userid?.trim() || identity.UserId?.trim()
    const openId = identity.openid?.trim() || identity.OpenId?.trim()

    if (!memberUserId && !openId) {
      this.logger.warn(
        `企业微信授权成功但未返回 userid/openid，返回字段：${Object.keys(identity).join(',')}`,
      )
      throw new UnauthorizedException('企业微信未返回可识别的用户身份')
    }

    if (memberUserId) {
      return this.resolveInternalUserProfile(token, memberUserId)
    }

    this.logger.warn(
      `当前登录身份不是企业内部成员，将按外部身份处理，openid=${openId}, external_userid=${identity.external_userid ?? ''}`,
    )

    return {
      userId: openId!,
      name: identity.external_userid?.trim() || openId!,
      avatarUrl: null,
    } satisfies WecomUserProfile
  }

  async resolveMiniappUserProfileByCode(code: string) {
    const token = await this.getMiniappAccessToken()
    const session = await this.fetchWecomJson<MiniappCode2SessionResponse>(
      `https://qyapi.weixin.qq.com/cgi-bin/miniprogram/jscode2session?access_token=${encodeURIComponent(token)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`,
    )

    const userId = session.userid?.trim()

    if (!userId) {
      this.logger.warn(`企业微信小程序登录未返回 userid，返回字段：${Object.keys(session).join(',')}`)
      throw new UnauthorizedException('企业微信小程序未返回可识别的用户身份')
    }

    return this.resolveInternalUserProfile(token, userId)
  }

  async sendAgentTextMessage(toUser: string, content: string) {
    const token = await this.getAgentAccessToken()
    const agentId = Number(this.getRequiredConfig('WECOM_AGENT_ID'))

    if (!Number.isFinite(agentId) || agentId <= 0) {
      throw new InternalServerErrorException('WECOM_AGENT_ID 配置不正确')
    }

    await this.fetchWecomJson<SendMessageResponse>(
      `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          touser: toUser,
          msgtype: 'text',
          agentid: agentId,
          text: {
            content,
          },
          safe: 0,
          enable_id_trans: 0,
          enable_duplicate_check: 0,
        }),
      },
    )
  }

  private async getAgentAccessToken() {
    if (this.cachedAgentAccessToken && this.cachedAgentAccessToken.expiresAt > Date.now()) {
      return this.cachedAgentAccessToken.value
    }

    const corpId = this.getRequiredConfig('WECOM_CORP_ID')
    const secret = this.getRequiredConfig('WECOM_AGENT_SECRET')
    const token = await this.fetchAccessToken(corpId, secret)

    this.cachedAgentAccessToken = token
    return token.value
  }

  private async getMiniappAccessToken() {
    if (this.cachedMiniappAccessToken && this.cachedMiniappAccessToken.expiresAt > Date.now()) {
      return this.cachedMiniappAccessToken.value
    }

    const corpId = this.getOptionalConfig('WECOM_MINIAPP_CORP_ID') || this.getRequiredConfig('WECOM_CORP_ID')
    const secret = this.getRequiredConfig('WECOM_MINIAPP_SECRET')
    const token = await this.fetchAccessToken(corpId, secret)

    this.cachedMiniappAccessToken = token
    return token.value
  }

  private async fetchAccessToken(corpId: string, secret: string) {
    const tokenResponse = await this.fetchWecomJson<AccessTokenResponse>(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(secret)}`,
    )

    if (!tokenResponse.access_token || !tokenResponse.expires_in) {
      throw new BadGatewayException('企业微信 access_token 返回不完整')
    }

    return {
      value: tokenResponse.access_token,
      expiresAt: Date.now() + Math.max(tokenResponse.expires_in - 120, 60) * 1000,
    }
  }

  private async resolveInternalUserProfile(token: string, userId: string) {
    const profile = await this.fetchWecomJson<GetUserProfileResponse>(
      `https://qyapi.weixin.qq.com/cgi-bin/user/get?access_token=${encodeURIComponent(token)}&userid=${encodeURIComponent(userId)}`,
    )

    return {
      userId: profile.userid?.trim() || userId,
      name: profile.name?.trim() || userId,
      avatarUrl: profile.avatar ?? null,
    } satisfies WecomUserProfile
  }

  private getRequiredConfig(key: string) {
    const value = this.configService.get<string>(key)?.trim()

    if (!value) {
      throw new InternalServerErrorException(`服务器缺少 ${key} 配置`)
    }

    return value
  }

  private getOptionalConfig(key: string) {
    return this.configService.get<string>(key)?.trim() || ''
  }

  private async fetchWecomJson<T extends { errcode: number; errmsg: string }>(
    url: string,
    init?: RequestInit,
  ) {
    let response: Response

    try {
      response = await fetch(url, init)
    } catch (error) {
      throw new BadGatewayException(
        error instanceof Error
          ? `无法连接企业微信：${error.message}`
          : '无法连接企业微信，请稍后重试',
      )
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `企业微信服务暂时不可用（HTTP ${response.status}），请稍后重试`,
      )
    }

    const result = (await response.json()) as T

    if (result.errcode !== 0) {
      throw new BadGatewayException(
        humanizeWecomError(result.errcode, result.errmsg),
      )
    }

    return result
  }
}

/**
 * 将企微原始 errcode/errmsg 转为可操作的中文说明（面向运营/审核，不展示英文技术串）
 */
function humanizeWecomError(errcode: number, errmsg?: string): string {
  const raw = (errmsg ?? '').trim()
  const lower = raw.toLowerCase()

  // 按错误码优先
  const byCode: Record<number, string> = {
    81013:
      '企微 UID 无效或该成员不在本应用可见范围内，请核对 UID 是否与企业微信通讯录一致',
    60111: '企微 UID 不存在，请到企业微信通讯录核对后重新填写',
    60020: '服务器 IP 未加入企业微信可信 IP 白名单，请联系技术配置',
    60011: '当前应用无权限操作该成员，请检查应用可见范围',
    48002: '当前应用无权调用此接口，请检查企业微信应用权限配置',
    301002: '无权访问该应用，请检查企业微信应用配置',
    40013: '企业微信企业 ID（CorpId）配置有误，请联系技术检查',
    40001: '企业微信应用 Secret 无效，请联系技术检查配置',
    40014: '企业微信授权令牌无效，请稍后重试或联系技术',
    42001: '企业微信授权已过期，请稍后重试',
    45009: '企业微信接口调用过于频繁，请稍后再试',
    40003: '企微 UID 格式不正确，请检查是否有多余空格或填错字段',
    40031: '不合法的 UserID 列表，请检查企微 UID',
    40032: '不合法的 UserID 列表，请检查企微 UID',
    40163: '登录凭证已使用或过期，请重新登录',
    40029: '登录凭证无效，请重新从企业微信进入',
  }

  if (byCode[errcode]) {
    return byCode[errcode]
  }

  // 文案特征兜底（部分接口码不稳定）
  if (
    lower.includes('user & party & tag all invalid') ||
    lower.includes('invalid userid') ||
    lower.includes('userid not found')
  ) {
    return '企微 UID 无效或不在应用可见范围内，请核对后重新填写'
  }

  if (lower.includes('access_token')) {
    return '企业微信授权异常，请稍后重试；若持续失败请联系技术'
  }

  if (lower.includes('ip') && lower.includes('whitelist')) {
    return '服务器 IP 未加入企业微信白名单，请联系技术配置'
  }

  // 未知错误：给中文包装，避免整段英文 + hint 刷屏
  if (raw) {
    const short = raw.split(/[,，]/)[0]?.trim() || raw
    const clipped = short.length > 80 ? `${short.slice(0, 80)}…` : short
    return `企业微信发送失败（错误码 ${errcode}）：${clipped}`
  }

  return `企业微信发送失败（错误码 ${errcode}），请稍后重试或联系技术`
}
