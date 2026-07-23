import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  PayloadTooLargeException,
  Post,
  Put,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { diskStorage } from 'multer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AuthService } from '../auth/auth.service.js'
import { CreateSubmissionDto } from './dto/create-submission.dto.js'
import { PreviewSubmissionDto } from './dto/preview-submission.dto.js'
import { UpdateGrantStatusDto } from './dto/update-grant-status.dto.js'
import { UpdateReviewStatusDto } from './dto/update-review-status.dto.js'
import { UpdateSubmissionDto } from './dto/update-submission.dto.js'
import { SubmissionsService } from './submissions.service.js'

const uploadDirectory = join(process.cwd(), 'uploads', 'submission-proofs')
const grantUploadDirectory = join(process.cwd(), 'uploads', 'grant-proofs')
const maxInlineImageBytes = 15 * 1024 * 1024

@Controller('submissions')
export class SubmissionsController {
  constructor(
    private readonly authService: AuthService,
    private readonly submissionsService: SubmissionsService,
  ) {}

  @Get('available-activities')
  async listAvailableActivities(@Headers('authorization') authorization?: string) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.submissionsService.listAvailableActivities(currentUser)
  }

  @Get('available-activities/:activityId')
  async getAvailableActivityDetail(
    @Headers('authorization') authorization: string | undefined,
    @Param('activityId') activityId: string,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.submissionsService.getAvailableActivityDetail(currentUser, activityId)
  }

  @Get('mine')
  async listMySubmissions(
    @Headers('authorization') authorization?: string,
    @Query('activityId') activityId?: string,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.submissionsService.listMySubmissions(currentUser, activityId)
  }

  @Get('mine/:submissionId')
  async getMySubmissionDetail(
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId') submissionId: string,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.submissionsService.getMySubmissionDetail(currentUser, submissionId)
  }

  @Post('preview')
  async previewSubmission(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: PreviewSubmissionDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.submissionsService.previewSubmission(currentUser, dto)
  }

  @Get('admin')
  async listAdminSubmissions(@Headers('authorization') authorization?: string) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.submissionsService.listAdminSubmissions(currentUser)
  }

  @Post()
  async createSubmission(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CreateSubmissionDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.submissionsService.createSubmission(currentUser, dto)
  }

  @Put('mine/:submissionId')
  async updateMySubmission(
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId') submissionId: string,
    @Body() dto: UpdateSubmissionDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.submissionsService.updateMySubmission(currentUser, submissionId, dto)
  }

  @Delete('mine/:submissionId/attachments/:attachmentId')
  async deleteMySubmissionAttachment(
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId') submissionId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.submissionsService.deleteMySubmissionAttachment(currentUser, submissionId, attachmentId)
  }

  @Post(':submissionId/review')
  async updateReviewStatus(
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId') submissionId: string,
    @Body() dto: UpdateReviewStatusDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.submissionsService.updateReviewStatus(currentUser, submissionId, dto)
  }

  @Post(':submissionId/grant')
  async updateGrantStatus(
    @Headers('authorization') authorization: string | undefined,
    @Param('submissionId') submissionId: string,
    @Body() dto: UpdateGrantStatusDto,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    return this.submissionsService.updateGrantStatus(currentUser, submissionId, dto)
  }

  @Post('upload-images')
  @UseInterceptors(
    FilesInterceptor('files', 9, {
      storage: diskStorage({
        destination: (_req: any, _file: any, callback: any) => {
          mkdirSync(uploadDirectory, { recursive: true })
          callback(null, uploadDirectory)
        },
        filename: (_req: any, file: any, callback: any) => {
          const extension = extname(file.originalname || '').toLowerCase() || '.png'
          callback(null, `${Date.now()}-${randomUUID()}${extension}`)
        },
      }),
      fileFilter: (_req: any, file: any, callback: any) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(new Error('仅支持上传图片文件'), false)
          return
        }

        callback(null, true)
      },
      limits: {
        fileSize: 50 * 1024 * 1024,
      },
    }),
  )
  async uploadImages(
    @Headers('authorization') authorization: string | undefined,
    @UploadedFiles() files: Array<any>,
  ) {
    this.authService.getCurrentUserFromAuthHeader(authorization)

    return {
      items: (files ?? []).map((file) => ({
        fileName: file.filename,
        fileUrl: `/api/uploads/submission-proofs/${file.filename}`,
      })),
    }
  }

  @Post('upload-images-base64')
  async uploadImagesBase64(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { fileName?: string; mimeType?: string; base64Data?: string },
  ) {
    this.authService.getCurrentUserFromAuthHeader(authorization)

    const fileName = saveInlineImageFile(uploadDirectory, body)

    return {
      items: [
        {
          fileName,
          fileUrl: `/api/uploads/submission-proofs/${fileName}`,
        },
      ],
    }
  }

  @Post('upload-grant-images')
  @UseInterceptors(
    FilesInterceptor('files', 9, {
      storage: diskStorage({
        destination: (_req: any, _file: any, callback: any) => {
          mkdirSync(grantUploadDirectory, { recursive: true })
          callback(null, grantUploadDirectory)
        },
        filename: (_req: any, file: any, callback: any) => {
          const extension = extname(file.originalname || '').toLowerCase() || '.png'
          callback(null, `${Date.now()}-${randomUUID()}${extension}`)
        },
      }),
      fileFilter: (_req: any, file: any, callback: any) => {
        if (!file.mimetype.startsWith('image/')) {
          callback(new Error('仅支持上传图片文件'), false)
          return
        }

        callback(null, true)
      },
      limits: {
        fileSize: 50 * 1024 * 1024,
      },
    }),
  )
  async uploadGrantImages(
    @Headers('authorization') authorization: string | undefined,
    @UploadedFiles() files: Array<any>,
  ) {
    const currentUser = this.authService.getCurrentUserFromAuthHeader(authorization)
    await this.submissionsService.assertGrantUploadAllowed(currentUser)

    return {
      items: (files ?? []).map((file) => ({
        fileName: file.filename,
        fileUrl: `/api/uploads/grant-proofs/${file.filename}`,
      })),
    }
  }
}

function saveInlineImageFile(
  targetDirectory: string,
  body: { fileName?: string; mimeType?: string; base64Data?: string },
) {
  const fileName = body.fileName?.trim()
  const mimeType = body.mimeType?.trim().toLowerCase()
  const base64Data = body.base64Data?.trim()

  if (!fileName || !mimeType || !base64Data) {
    throw new BadRequestException('图片数据不完整，请重新选择图片')
  }

  if (!mimeType.startsWith('image/')) {
    throw new BadRequestException('仅支持上传图片文件')
  }

  const buffer = Buffer.from(base64Data, 'base64')
  if (!buffer.length) {
    throw new BadRequestException('图片内容为空，请重新选择图片')
  }

  if (buffer.byteLength > maxInlineImageBytes) {
    throw new PayloadTooLargeException('图片不能超过 15MB')
  }

  mkdirSync(targetDirectory, { recursive: true })

  const extension = extname(fileName).toLowerCase() || getExtensionByMimeType(mimeType)
  const storedFileName = `${Date.now()}-${randomUUID()}${extension}`

  writeFileSync(join(targetDirectory, storedFileName), buffer)

  return storedFileName
}

function getExtensionByMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return '.jpg'
  }

  if (mimeType === 'image/png') {
    return '.png'
  }

  if (mimeType === 'image/webp') {
    return '.webp'
  }

  if (mimeType === 'image/gif') {
    return '.gif'
  }

  if (mimeType === 'image/heic') {
    return '.heic'
  }

  if (mimeType === 'image/heif') {
    return '.heif'
  }

  return '.png'
}
