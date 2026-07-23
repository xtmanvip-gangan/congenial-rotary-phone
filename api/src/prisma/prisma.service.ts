import { INestApplication, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }

  async enableShutdownHooks(_app: INestApplication) {
    // Prisma v6 在当前类型定义里不再暴露 beforeExit 事件，这里保留空实现，
    // 由 Nest 自身的生命周期钩子负责关闭连接即可。
  }
}
