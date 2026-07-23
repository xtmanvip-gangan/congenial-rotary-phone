import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { createHash } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../prisma/prisma.service.js'
import type { AuthenticatedUser } from '../auth/auth.types.js'
import { CreateOperatorDto } from './dto/create-operator.dto.js'

@Injectable()
export class OperatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async listOperators(currentUser: AuthenticatedUser) {
    this.ensureSuperAdmin(currentUser)

    const operators = await this.prisma.operatorAccount.findMany({
      where: {
        role: 'operator',
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })

    return {
      items: operators.map((operator: (typeof operators)[number]) => ({
        id: operator.id,
        displayName: operator.displayName,
        wecomUserId: operator.wecomUserId ?? '',
        username: operator.username ?? '',
        status: operator.status,
        createdAt: operator.createdAt.toISOString(),
        updatedAt: operator.updatedAt.toISOString(),
      })),
    }
  }

  async createOperator(currentUser: AuthenticatedUser, dto: CreateOperatorDto) {
    this.ensureSuperAdmin(currentUser)

    const normalizedWecomUserId = dto.wecomUserId?.trim() || null
    const normalizedDisplayName = dto.displayName.trim()
    const normalizedUsername = dto.username.trim().toLowerCase()
    const normalizedPassword = dto.password.trim()

    if (!normalizedDisplayName || !normalizedUsername || !normalizedPassword) {
      throw new BadRequestException('运营老师姓名、登录账号和密码不能为空')
    }

    const existingByUsername = await this.prisma.operatorAccount.findUnique({
      where: {
        username: normalizedUsername,
      },
    })

    if (existingByUsername) {
      throw new BadRequestException('该登录账号已存在，请勿重复添加')
    }

    if (normalizedWecomUserId) {
      const existingByWecom = await this.prisma.operatorAccount.findUnique({
        where: {
          wecomUserId: normalizedWecomUserId,
        },
      })

      if (existingByWecom) {
        throw new BadRequestException('该企微账号已存在，请勿重复添加')
      }
    }

    const operator = await this.prisma.operatorAccount.create({
      data: {
        displayName: normalizedDisplayName,
        wecomUserId: normalizedWecomUserId,
        username: normalizedUsername,
        passwordHash: this.hashPassword(normalizedPassword),
        role: 'operator',
        status: 'active',
      },
    })

    return {
      item: {
        id: operator.id,
        displayName: operator.displayName,
        wecomUserId: operator.wecomUserId ?? '',
        username: operator.username ?? '',
        status: operator.status,
        createdAt: operator.createdAt.toISOString(),
        updatedAt: operator.updatedAt.toISOString(),
      },
    }
  }

  async updateOperatorStatus(
    currentUser: AuthenticatedUser,
    operatorId: string,
    status: 'active' | 'disabled',
  ) {
    this.ensureSuperAdmin(currentUser)

    const operator = await this.prisma.operatorAccount.findFirst({
      where: {
        id: operatorId,
        role: 'operator',
      },
    })

    if (!operator) {
      throw new NotFoundException('未找到对应的运营老师账号')
    }

    const updated = await this.prisma.operatorAccount.update({
      where: {
        id: operator.id,
      },
      data: {
        status,
      },
    })

    return {
      item: {
        id: updated.id,
        displayName: updated.displayName,
        wecomUserId: updated.wecomUserId ?? '',
        username: updated.username ?? '',
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    }
  }

  private ensureSuperAdmin(currentUser: AuthenticatedUser) {
    if (currentUser.role !== 'super_admin') {
      throw new ForbiddenException('只有超级管理员可以管理运营老师账号')
    }
  }

  private hashPassword(password: string) {
    const tokenSecret = this.configService.get<string>('JWT_SECRET')?.trim()

    if (!tokenSecret) {
      throw new BadRequestException('服务端未配置 JWT_SECRET，暂时无法创建后台账号')
    }

    return createHash('sha256')
      .update(`${tokenSecret}:${password}`)
      .digest('hex')
  }
}
