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
        error instanceof Error ? error.message : '企业微信接口请求失败',
      )
    }

    if (!response.ok) {
      throw new BadGatewayException(`企业微信接口返回 HTTP ${response.status}`)
    }

    const result = (await response.json()) as T

    if (result.errcode !== 0) {
      throw new BadGatewayException(
        `企业微信接口错误：${result.errmsg || String(result.errcode)}`,
      )
    }

    return result
  }
}
