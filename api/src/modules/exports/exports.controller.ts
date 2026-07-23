import { Controller, Get, Headers, Query, Req, Res } from '@nestjs/common'
import { AuthService } from '../auth/auth.service.js'
import { ExportSubmissionsQueryDto } from './dto/export-submissions-query.dto.js'
import { ExportsService } from './exports.service.js'

@Controller('exports')
export class ExportsController {
  constructor(
    private readonly authService: AuthService,
    private readonly exportsService: ExportsService,
  ) {}

  @Get('submissions/xlsx')
  async exportSubmissionsXlsx(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ExportSubmissionsQueryDto,
    @Req() request: any,
    @Res() response: any,
  ) {
    const queryToken = String(request.query?.token ?? '').trim()
    const currentUser = authorization
      ? this.authService.getCurrentUserFromAuthHeader(authorization)
      : this.authService.getCurrentUserFromToken(queryToken)
    const result = await this.exportsService.exportSubmissionsXlsx(
      currentUser,
      query,
      this.resolvePublicBaseUrl(request),
    )

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    const fallbackFileName = this.buildAsciiFallbackFileName(result.fileName)
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackFileName}"; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
    )
    response.setHeader('Content-Length', result.content.length)

    response.send(Buffer.from(result.content))
  }

  private buildAsciiFallbackFileName(fileName: string) {
    const normalized = fileName
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/["\\]/g, '')
      .trim()

    if (normalized) {
      return normalized
    }

    return `submissions-report-${new Date().toISOString().slice(0, 10)}.xlsx`
  }

  private resolvePublicBaseUrl(request: any) {
    const configured = String(process.env.PUBLIC_BASE_URL ?? '').trim()
    if (configured) {
      return configured.replace(/\/$/, '')
    }

    const forwardedProto = String(request.headers['x-forwarded-proto'] ?? '')
      .split(',')[0]
      .trim()
    const protocol = forwardedProto || request.protocol || 'https'

    const normalizeHost = (value: unknown) => {
      const host = String(value ?? '')
        .split(',')[0]
        .trim()
      if (!host) {
        return ''
      }
      if (!/^[a-z0-9.\-:\[\]]+$/i.test(host)) {
        return ''
      }
      return host
    }

    const forwardedHost = normalizeHost(request.headers['x-forwarded-host'])
    const host = forwardedHost || normalizeHost(request.headers.host) || 'localhost'
    return `${protocol}://${host}`
  }
}
