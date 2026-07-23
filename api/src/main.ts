import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { mkdir } from 'node:fs/promises'
import express from 'express'
import { join } from 'node:path'
import { AppModule } from './app.module.js'
import { PrismaService } from './prisma/prisma.service.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: true,
  })
  const uploadsRoot = join(process.cwd(), 'uploads')

  await mkdir(uploadsRoot, { recursive: true })

  app.setGlobalPrefix('api')
  app.use(express.json({ limit: '30mb' }))
  app.use(express.urlencoded({ extended: true, limit: '30mb' }))
  app.use('/api/uploads', express.static(uploadsRoot))
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
  await app.listen(port)
}

void bootstrap()
