import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { mkdir } from 'node:fs/promises'
import express from 'express'
import { join } from 'node:path'
import { AppModule } from './app.module.js'
import { PrismaService } from './prisma/prisma.service.js'
import { securityHeaders } from './common/security/security-headers.middleware.js'
import { resolveApiListenHost } from './common/security/network-config.js'

async function bootstrap() {
  // 关闭 Nest 默认 100kb bodyParser，统一用下方 15mb，避免截图 base64 被拒
  const app = await NestFactory.create(AppModule, { bodyParser: false })
  const uploadsRoot = join(process.cwd(), 'uploads')

  await mkdir(uploadsRoot, { recursive: true })
  await mkdir(join(uploadsRoot, 'onboarding-proofs'), { recursive: true })
  await mkdir(join(uploadsRoot, 'submission-proofs'), { recursive: true })

  const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production'
        ? configuredOrigins
        : configuredOrigins.length > 0
          ? configuredOrigins
          : true,
    credentials: false,
  })
  app.setGlobalPrefix('api')
  app.use(securityHeaders)
  // 岗前/提报截图走 base64 JSON（压缩后通常 <2MB，上限留余量）
  app.use(express.json({ limit: '15mb' }))
  app.use(express.urlencoded({ extended: true, limit: '15mb' }))
  app.use(
    '/api/uploads',
    express.static(uploadsRoot, {
      dotfiles: 'deny',
      index: false,
      fallthrough: false,
    }),
  )
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  )

  const prismaService = app.get(PrismaService)
  await prismaService.enableShutdownHooks(app)

  const port = Number(process.env.API_PORT ?? 3000)
  await app.listen(port, resolveApiListenHost(process.env))
}

void bootstrap()
