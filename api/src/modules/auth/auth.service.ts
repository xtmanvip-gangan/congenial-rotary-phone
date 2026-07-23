import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../../prisma/prisma.service.js'
import type { LoginResponse, SessionTokenPayload, AppRole } from './auth.types.js'
import { WecomService } from './wecom.service.js'

const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly wecomService: WecomService,
    private readonly prisma: PrismaService,
  ) {}

  getWecomLoginUrl(state?: string) {
    return {
      url: this.wecomService.buildAuthorizeUrl(state),
    }
  }

  async loginWithWecomCode(code: string): Promise<LoginResponse> {
    const profile = await this.wecomService.resolveUserProfileByCode(code)
    return this.buildLoginResponse(profile)
  }

  async loginWithMiniappCode(code: string): Promise<LoginResponse> {
    const profile = await this.wecomService.resolveMiniappUserProfileByCode(code)
    return this.buildLoginResponse(profile)
  }

  async loginWithPassword(username: string, password: string): Promise<LoginResponse> {
    const normalizedUsername = username.trim().toLowerCase()
    const normalizedPassword = password.trim()

    if (!normalizedUsername || !normalizedPassword) {
      throw new UnauthorizedException('请输入账号和密码')
    }

    await this.ensureBootstrapAdminExists()

    const account = await this.prisma.operatorAccount.findFirst({
      where: {
        username: normalizedUsername,
        status: 'active',
      },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        displayName: true,
        role: true,
      },
    })

    if (!account?.passwordHash) {
      throw new UnauthorizedException('账号或密码错误')
    }

    if (!this.safeCompareHash(account.passwordHash, this.hashPassword(normalizedPassword))) {
      throw new UnauthorizedException('账号或密码错误')
    }

    return this.buildPasswordLoginResponse(account)
  }

  private async buildLoginResponse(profile: {
    userId: string
    name: string
    avatarUrl: string | null
  }): Promise<LoginResponse> {
    const role = await this.resolveRole(profile.userId)
    const user = {
      accountId: null,
      wecomUserId: profile.userId,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      role,
      loginType: 'wecom',
    } as const

    return {
      token: this.signSession(user),
      user,
    }
  }

  private buildPasswordLoginResponse(account: {
    id: string
    username: string | null
    displayName: string
    role: AppRole
  }): LoginResponse {
    const user = {
      accountId: account.id,
      wecomUserId: account.username ?? `account:${account.id}`,
      name: account.displayName,
      avatarUrl: null,
      role: account.role,
      loginType: 'password',
    } as const

    return {
      token: this.signSession(user),
      user,
    }
  }

  getCurrentUserFromAuthHeader(authorization?: string) {
    const token = this.extractBearerToken(authorization)
    return this.getCurrentUserFromToken(token)
  }

  getCurrentUserFromToken(token: string) {
    const payload = this.verifyToken(token)

    return {
      accountId: payload.accountId ?? null,
      wecomUserId: payload.sub,
      name: payload.name,
      avatarUrl: payload.avatarUrl,
      role: payload.role,
      loginType: payload.loginType ?? 'wecom',
    }
  }

  async getActiveAdminAccount(currentUser: {
    accountId?: string | null
    wecomUserId: string
    role: AppRole
  }) {
    if (currentUser.role !== 'operator' && currentUser.role !== 'super_admin') {
      throw new UnauthorizedException('当前账号没有后台权限')
    }

    if (currentUser.accountId) {
      return this.prisma.operatorAccount.findFirst({
        where: {
          id: currentUser.accountId,
          status: 'active',
        },
      })
    }

    return this.prisma.operatorAccount.findFirst({
      where: {
        wecomUserId: currentUser.wecomUserId,
        status: 'active',
      },
    })
  }

  private async resolveRole(wecomUserId: string): Promise<AppRole> {
    const normalizedUserId = wecomUserId.trim()

    const operatorAccount = await this.prisma.operatorAccount.findUnique({
      where: {
        wecomUserId: normalizedUserId,
      },
      select: {
        role: true,
        status: true,
      },
    })

    if (operatorAccount?.status === 'active') {
      return operatorAccount.role
    }

    return 'anchor'
  }

  private signSession(user: {
    accountId?: string | null
    wecomUserId: string
    name: string
    avatarUrl: string | null
    role: AppRole
    loginType: 'wecom' | 'password'
  }) {
    const now = Math.floor(Date.now() / 1000)
    const payload: SessionTokenPayload = {
      sub: user.wecomUserId,
      accountId: user.accountId ?? undefined,
      role: user.role,
      name: user.name,
      avatarUrl: user.avatarUrl,
      loginType: user.loginType,
      iat: now,
      exp: now + SESSION_DURATION_SECONDS,
    }

    const encodedPayload = this.encodeBase64Url(JSON.stringify(payload))
    const signature = this.createSignature(encodedPayload)

    return `${encodedPayload}.${signature}`
  }

  private verifyToken(token: string): SessionTokenPayload {
    const [encodedPayload, signature] = token.split('.')

    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('登录态格式无效')
    }

    const expectedSignature = this.createSignature(encodedPayload)

    if (!this.safeCompare(signature, expectedSignature)) {
      throw new UnauthorizedException('登录态签名校验失败')
    }

    let payload: SessionTokenPayload

    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8')) as SessionTokenPayload
    } catch {
      throw new UnauthorizedException('登录态解析失败')
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('登录态已过期')
    }

    return payload
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization) {
      throw new UnauthorizedException('缺少登录凭证')
    }

    const [type, token] = authorization.split(' ')

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('登录凭证格式错误')
    }

    return token
  }

  private readUserList(key: string) {
    const rawValue = this.configService.get<string>(key)

    return new Set(
      (rawValue ?? '')
        .split(',')
        .map((item: string) => item.trim())
        .filter(Boolean),
    )
  }

  private createSignature(encodedPayload: string) {
    return createHmac('sha256', this.getTokenSecret())
      .update(encodedPayload)
      .digest('base64url')
  }

  private async ensureBootstrapAdminExists() {
    const adminUsername = this.configService.get<string>('ADMIN_INIT_USERNAME')?.trim().toLowerCase()
    const adminPassword = this.configService.get<string>('ADMIN_INIT_PASSWORD')?.trim()
    const adminDisplayName =
      this.configService.get<string>('ADMIN_INIT_DISPLAY_NAME')?.trim() || '系统管理员'

    if (!adminUsername || !adminPassword) {
      return
    }

    const existing = await this.prisma.operatorAccount.findFirst({
      where: {
        username: adminUsername,
      },
      select: {
        id: true,
      },
    })

    if (existing) {
      return
    }

    await this.prisma.operatorAccount.create({
      data: {
        username: adminUsername,
        passwordHash: this.hashPassword(adminPassword),
        displayName: adminDisplayName,
        role: 'super_admin',
        status: 'active',
      },
    })
  }

  private hashPassword(password: string) {
    return createHash('sha256')
      .update(`${this.getTokenSecret()}:${password}`)
      .digest('hex')
  }

  private safeCompareHash(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)

    if (leftBuffer.length !== rightBuffer.length) {
      return false
    }

    return timingSafeEqual(leftBuffer, rightBuffer)
  }

  private getTokenSecret() {
    const tokenSecret = this.configService.get<string>('JWT_SECRET')?.trim()

    if (!tokenSecret) {
      throw new InternalServerErrorException('服务端未配置 JWT_SECRET，暂时无法完成登录。')
    }

    return tokenSecret
  }

  private encodeBase64Url(value: string) {
    return Buffer.from(value).toString('base64url')
  }

  private safeCompare(left: string, right: string) {
    const leftBuffer = Buffer.from(left)
    const rightBuffer = Buffer.from(right)

    if (leftBuffer.length !== rightBuffer.length) {
      return false
    }

    return timingSafeEqual(leftBuffer, rightBuffer)
  }
}
