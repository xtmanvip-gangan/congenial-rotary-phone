import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import argon2 from 'argon2'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../../prisma/prisma.service.js'
import type {
  AnchorProfileStatus,
  AppRole,
  AuthenticatedUser,
  LoginResponse,
  LoginType,
  SessionTokenPayload,
  StaffRole,
} from './auth.types.js'
import { WecomService } from './wecom.service.js'

const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60
const STAFF_ROLE_PRIORITY: StaffRole[] = [
  'training_admin',
  'training_teacher',
  'audit_teacher',
  'operator',
]

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
    const account = await this.prisma.operatorAccount.findUnique({
      where: {
        wecomUserId: profile.userId.trim(),
      },
      include: {
        staffRoles: {
          select: {
            role: true,
          },
        },
      },
    })

    if (
      !account ||
      account.status !== 'active' ||
      account.role === 'super_admin' ||
      account.staffRoles.length === 0
    ) {
      throw new UnauthorizedException('当前企微账号未开通后台权限')
    }

    const roles = account.staffRoles.map(({ role }) => role as StaffRole)
    const role = STAFF_ROLE_PRIORITY.find((item) => roles.includes(item))

    if (!role) {
      throw new UnauthorizedException('当前企微账号未开通后台权限')
    }

    return this.createLoginResponse({
      accountId: account.id,
      wecomUserId: profile.userId,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      role,
      roles,
      loginType: 'wecom_staff',
    })
  }

  async loginWithMiniappCode(code: string): Promise<LoginResponse> {
    const profile = await this.wecomService.resolveMiniappUserProfileByCode(code)
    const wecomUser = await this.prisma.wecomUser.upsert({
      where: {
        wecomUserId: profile.userId,
      },
      update: {
        wecomName: profile.name,
        avatarUrl: profile.avatarUrl,
      },
      create: {
        wecomUserId: profile.userId,
        wecomName: profile.name,
        avatarUrl: profile.avatarUrl,
      },
    })
    const [anchorProfile, activationTask] = await Promise.all([
      this.prisma.anchorProfile.findUnique({
        where: {
          wecomUserRecordId: wecomUser.id,
        },
        select: {
          assignmentStatus: true,
        },
      }),
      this.prisma.anchorActivationTask.findUnique({
        where: {
          expectedWecomUserId: profile.userId,
        },
        select: {
          status: true,
        },
      }),
    ])

    return this.createLoginResponse({
      accountId: null,
      wecomUserId: profile.userId,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      role: 'anchor',
      roles: ['anchor'],
      loginType: 'wecom_miniapp',
      anchorProfileStatus: this.resolveAnchorProfileStatus(
        anchorProfile?.assignmentStatus,
        activationTask?.status,
      ),
    })
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
        role: 'super_admin',
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

    if (
      !account?.passwordHash ||
      account.role !== 'super_admin' ||
      !(await this.verifyPassword(account.passwordHash, normalizedPassword))
    ) {
      throw new UnauthorizedException('账号或密码错误')
    }

    if (!account.passwordHash.startsWith('$argon2id$')) {
      await this.prisma.operatorAccount.update({
        where: {
          id: account.id,
        },
        data: {
          passwordHash: await this.hashPassword(normalizedPassword),
        },
      })
    }

    return this.createLoginResponse({
      accountId: account.id,
      wecomUserId: account.username ?? `account:${account.id}`,
      name: account.displayName,
      avatarUrl: null,
      role: 'super_admin',
      roles: ['super_admin'],
      loginType: 'password_admin',
    })
  }

  getCurrentUserFromAuthHeader(authorization?: string) {
    const token = this.extractBearerToken(authorization)
    return this.getCurrentUserFromToken(token)
  }

  getCurrentUserFromToken(token: string): AuthenticatedUser {
    const payload = this.verifyToken(token)

    return {
      accountId: payload.accountId ?? null,
      wecomUserId: payload.sub,
      name: payload.name,
      avatarUrl: payload.avatarUrl,
      role: payload.role,
      roles: payload.roles,
      loginType: payload.loginType,
      anchorProfileStatus: payload.anchorProfileStatus,
    }
  }

  async getActiveAdminAccount(currentUser: AuthenticatedUser) {
    if (currentUser.role === 'anchor') {
      throw new UnauthorizedException('当前账号没有后台权限')
    }

    if (currentUser.loginType === 'password_admin' && currentUser.accountId) {
      return this.prisma.operatorAccount.findFirst({
        where: {
          id: currentUser.accountId,
          role: 'super_admin',
          status: 'active',
        },
      })
    }

    if (currentUser.loginType !== 'wecom_staff') {
      throw new UnauthorizedException('当前账号没有后台权限')
    }

    return this.prisma.operatorAccount.findFirst({
      where: {
        wecomUserId: currentUser.wecomUserId,
        status: 'active',
      },
    })
  }

  private createLoginResponse(user: AuthenticatedUser): LoginResponse {
    return {
      token: this.signSession(user),
      user,
    }
  }

  private signSession(user: AuthenticatedUser) {
    const now = Math.floor(Date.now() / 1000)
    const payload: SessionTokenPayload = {
      sub: user.wecomUserId,
      accountId: user.accountId ?? undefined,
      role: user.role,
      roles: user.roles,
      name: user.name,
      avatarUrl: user.avatarUrl,
      loginType: user.loginType,
      anchorProfileStatus: user.anchorProfileStatus,
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
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf-8'),
      ) as SessionTokenPayload
    } catch {
      throw new UnauthorizedException('登录态解析失败')
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('登录态已过期')
    }

    if (!Array.isArray(payload.roles) || !payload.loginType) {
      throw new UnauthorizedException('登录态版本已失效，请重新登录')
    }

    return payload
  }

  private createSignature(encodedPayload: string) {
    return createHmac('sha256', this.getTokenSecret())
      .update(encodedPayload)
      .digest('base64url')
  }

  private async ensureBootstrapAdminExists() {
    const adminUsername = this.configService
      .get<string>('ADMIN_INIT_USERNAME')
      ?.trim()
      .toLowerCase()
    const adminPassword = this.configService
      .get<string>('ADMIN_INIT_PASSWORD')
      ?.trim()
    const adminDisplayName =
      this.configService.get<string>('ADMIN_INIT_DISPLAY_NAME')?.trim() ||
      '系统管理员'

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
        passwordHash: await this.hashPassword(adminPassword),
        displayName: adminDisplayName,
        role: 'super_admin',
        status: 'active',
      },
    })
  }

  private async hashPassword(password: string) {
    return argon2.hash(password, {
      type: argon2.argon2id,
    })
  }

  private async verifyPassword(passwordHash: string, password: string) {
    if (passwordHash.startsWith('$argon2id$')) {
      try {
        return await argon2.verify(passwordHash, password)
      } catch {
        return false
      }
    }

    return this.safeCompare(
      passwordHash,
      createHash('sha256')
        .update(`${this.getTokenSecret()}:${password}`)
        .digest('hex'),
    )
  }

  private resolveAnchorProfileStatus(
    assignmentStatus:
      | 'pending_confirmation'
      | 'confirmed'
      | 'rejected'
      | 'ended'
      | null
      | undefined,
    activationStatus:
      | 'pending'
      | 'invited'
      | 'activated'
      | 'cancelled'
      | undefined,
  ): AnchorProfileStatus {
    if (assignmentStatus === 'confirmed') {
      return 'active'
    }

    if (assignmentStatus) {
      return 'pending_confirmation'
    }

    if (activationStatus === 'pending' || activationStatus === 'invited') {
      return 'not_activated'
    }

    return 'not_eligible'
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

  private getTokenSecret() {
    const tokenSecret = this.configService.get<string>('JWT_SECRET')?.trim()

    if (!tokenSecret) {
      throw new InternalServerErrorException(
        '服务端未配置 JWT_SECRET，暂时无法完成登录。',
      )
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
