import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
} from '@nestjs/common'
import { mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AuthService } from '../auth/auth.service.js'
import { ActivitiesService } from './activities.service.js'
import { CreateActivityDto } from './dto/create-activity.dto.js'
import { SaveActivityConfigDto } from './dto/save-activity-config.dto.js'
import { UpdateActivityDto } from './dto/update-activity.dto.js'
import { UpdateActivityStatusDto } from './dto/update-activity-status.dto.js'

const coverUploadDirectory = join(process.cwd(), 'uploads', 'activity-covers')
const maxCoverBytes = 8 * 1024 * 1024

@Controller('activities')
export class ActivitiesController {
  constructor(
    private readonly authService: AuthService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  @Get('types')
  async listActivityTypes(@Headers('authorization') authorization?: string) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.listActivityTypes(currentUser)
  }

  /** 活动封面独立目录，避免与提报截图混用 */
  @Post('upload-cover')
  async uploadCover(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { fileName?: string; mimeType?: string; base64Data?: string },
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    await this.activitiesService.assertCanManageActivities(currentUser)

    const fileName = body.fileName?.trim()
    const mimeType = body.mimeType?.trim().toLowerCase()
    const base64Data = body.base64Data?.trim()
    if (!fileName || !mimeType || !base64Data) {
      throw new BadRequestException('封面数据不完整')
    }
    if (!mimeType.startsWith('image/')) {
      throw new BadRequestException('封面仅支持图片')
    }

    const buffer = Buffer.from(base64Data, 'base64')
    if (!buffer.length) {
      throw new BadRequestException('封面内容为空')
    }
    if (buffer.byteLength > maxCoverBytes) {
      throw new PayloadTooLargeException('封面不能超过 8MB')
    }

    mkdirSync(coverUploadDirectory, { recursive: true })
    const extension =
      extname(fileName).toLowerCase() ||
      (mimeType === 'image/jpeg'
        ? '.jpg'
        : mimeType === 'image/webp'
          ? '.webp'
          : '.png')
    const storedFileName = `${Date.now()}-${randomUUID()}${extension}`
    writeFileSync(join(coverUploadDirectory, storedFileName), buffer)

    return {
      items: [
        {
          fileName: storedFileName,
          fileUrl: `/api/uploads/activity-covers/${storedFileName}`,
        },
      ],
    }
  }

  @Get()
  async listActivities(@Headers('authorization') authorization?: string) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.listActivities(currentUser)
  }

  @Get(':activityId/config')
  async getActivityConfig(
    @Headers('authorization') authorization: string | undefined,
    @Param('activityId') activityId: string,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.getActivityConfig(currentUser, activityId)
  }

  @Post()
  async createActivity(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateActivityDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.createActivity(currentUser, dto)
  }

  @Put(':activityId')
  async updateActivity(
    @Headers('authorization') authorization: string | undefined,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.updateActivity(currentUser, activityId, dto)
  }

  @Patch(':activityId/status')
  async updateActivityStatus(
    @Headers('authorization') authorization: string | undefined,
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityStatusDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.updateActivityStatus(currentUser, activityId, dto.status)
  }

  @Put(':activityId/config')
  async saveActivityConfig(
    @Headers('authorization') authorization: string | undefined,
    @Param('activityId') activityId: string,
    @Body() dto: SaveActivityConfigDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.activitiesService.saveActivityConfig(currentUser, activityId, dto)
  }
}
