import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  PayloadTooLargeException,
  Post,
} from '@nestjs/common'
import { mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AuthService } from '../auth/auth.service.js'
import {
  ConfirmMilestoneDto,
  RejectMilestoneDto,
  SubmitMilestoneDto,
} from './dto/submit-milestone.dto.js'
import { OnboardingService } from './onboarding.service.js'

const onboardingUploadDirectory = join(
  process.cwd(),
  'uploads',
  'onboarding-proofs',
)
const maxImageBytes = 8 * 1024 * 1024

@Controller('operators/me/anchors/:anchorId/onboarding')
export class OnboardingController {
  constructor(
    private readonly authService: AuthService,
    private readonly onboardingService: OnboardingService,
  ) {}

  @Get()
  getProgress(
    @Headers('authorization') authorization: string | undefined,
    @Param('anchorId') anchorId: string,
  ) {
    return this.onboardingService.getProgressForOperator(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      anchorId,
    )
  }

  @Post('upload-images')
  uploadImages(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: { fileName?: string; mimeType?: string; base64Data?: string },
  ) {
    this.authService.getCurrentUserFromAuthHeader(authorization)
    return saveOnboardingImage(body)
  }

  @Post(':milestone/submit')
  submitMilestone(
    @Headers('authorization') authorization: string | undefined,
    @Param('anchorId') anchorId: string,
    @Param('milestone') milestone: string,
    @Body() dto: SubmitMilestoneDto,
  ) {
    return this.onboardingService.submitMilestone(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      anchorId,
      milestone,
      dto,
    )
  }
}

@Controller('anchors/me/onboarding')
export class AnchorOnboardingController {
  constructor(
    private readonly authService: AuthService,
    private readonly onboardingService: OnboardingService,
  ) {}

  @Get()
  getProgress(@Headers('authorization') authorization?: string) {
    return this.onboardingService.getProgressForAnchor(
      this.authService.getCurrentUserFromAuthHeader(authorization),
    )
  }

  @Post(':milestone/confirm')
  confirm(
    @Headers('authorization') authorization: string | undefined,
    @Param('milestone') milestone: string,
    @Body() dto: ConfirmMilestoneDto,
  ) {
    return this.onboardingService.confirmMilestoneAsAnchor(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      milestone,
      dto,
    )
  }

  @Post(':milestone/reject')
  reject(
    @Headers('authorization') authorization: string | undefined,
    @Param('milestone') milestone: string,
    @Body() dto: RejectMilestoneDto,
  ) {
    return this.onboardingService.rejectMilestoneAsAnchor(
      this.authService.getCurrentUserFromAuthHeader(authorization),
      milestone,
      dto,
    )
  }
}

function saveOnboardingImage(body: {
  fileName?: string
  mimeType?: string
  base64Data?: string
}) {
  const fileName = body.fileName?.trim()
  const mimeType = body.mimeType?.trim().toLowerCase()
  const base64Data = body.base64Data?.trim()
  if (!fileName || !mimeType || !base64Data) {
    throw new BadRequestException('图片数据不完整')
  }
  if (!mimeType.startsWith('image/')) {
    throw new BadRequestException('仅支持图片')
  }

  const buffer = Buffer.from(base64Data, 'base64')
  if (!buffer.length) {
    throw new BadRequestException('图片内容为空')
  }
  if (buffer.byteLength > maxImageBytes) {
    throw new PayloadTooLargeException('图片不能超过 8MB')
  }

  mkdirSync(onboardingUploadDirectory, { recursive: true })
  const extension =
    extname(fileName).toLowerCase() ||
    (mimeType === 'image/jpeg'
      ? '.jpg'
      : mimeType === 'image/webp'
        ? '.webp'
        : '.png')
  const storedFileName = `${Date.now()}-${randomUUID()}${extension}`
  writeFileSync(join(onboardingUploadDirectory, storedFileName), buffer)

  return {
    items: [
      {
        fileName: storedFileName,
        fileUrl: `/api/uploads/onboarding-proofs/${storedFileName}`,
      },
    ],
  }
}
