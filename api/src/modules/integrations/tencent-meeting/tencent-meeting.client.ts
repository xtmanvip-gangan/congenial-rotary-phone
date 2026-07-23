import { createHmac, randomInt } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type {
  CreateTencentMeetingInput,
  TencentMeetingDetails,
  TencentMeetingGateway,
  TencentMeetingParticipant,
} from './tencent-meeting.types.js'

type SignatureInput = {
  method: string
  requestUri: string
  body: string
  secretId: string
  secretKey: string
  timestamp: string
  nonce: string
}

type TencentMeetingConfig = {
  appId: string
  sdkId: string | null
  secretId: string
  secretKey: string
  userId: string
}

export function createTencentMeetingSignature(input: SignatureInput) {
  const headerString = [
    `X-TC-Key=${input.secretId}`,
    `X-TC-Nonce=${input.nonce}`,
    `X-TC-Timestamp=${input.timestamp}`,
  ].join('&')
  const stringToSign = [
    input.method.toUpperCase(),
    headerString,
    input.requestUri,
    input.body,
  ].join('\n')
  const hexDigest = createHmac('sha256', input.secretKey)
    .update(stringToSign)
    .digest('hex')
    .toLowerCase()
  return Buffer.from(hexDigest).toString('base64')
}

@Injectable()
export class TencentMeetingClient implements TencentMeetingGateway {
  private readonly baseUrl = 'https://api.meeting.qq.com'

  constructor(private readonly configService: ConfigService) {}

  async createMeeting(
    input: CreateTencentMeetingInput,
  ): Promise<TencentMeetingDetails> {
    const config = this.getConfig()
    const response = await this.request<Record<string, unknown>>(
      'POST',
      '/v1/meetings',
      {
        userid: config.userId,
        instanceid: 1,
        subject: input.subject,
        type: 0,
        start_time: String(Math.floor(input.startAt.getTime() / 1000)),
        end_time: String(Math.floor(input.endAt.getTime() / 1000)),
        settings: {
          mute_enable_join: true,
          allow_unmute_self: true,
          allow_in_before_host: true,
          auto_in_waiting_room: false,
        },
      },
      config,
    )
    const meetings = Array.isArray(response.meeting_info_list)
      ? response.meeting_info_list
      : []
    const meeting = meetings[0] as Record<string, unknown> | undefined
    if (!meeting?.meeting_id || !meeting.meeting_code || !meeting.join_url) {
      throw new Error('腾讯会议创建成功但返回信息不完整')
    }
    return {
      meetingId: String(meeting.meeting_id),
      meetingCode: String(meeting.meeting_code),
      joinUrl: String(meeting.join_url),
      raw: response,
    }
  }

  async updateMeeting(
    meetingId: string,
    input: CreateTencentMeetingInput,
  ): Promise<void> {
    const config = this.getConfig()
    await this.request(
      'PUT',
      `/v1/meetings/${encodeURIComponent(meetingId)}`,
      {
        userid: config.userId,
        instanceid: 1,
        subject: input.subject,
        start_time: String(Math.floor(input.startAt.getTime() / 1000)),
        end_time: String(Math.floor(input.endAt.getTime() / 1000)),
      },
      config,
    )
  }

  async cancelMeeting(meetingId: string, reason: string): Promise<void> {
    const config = this.getConfig()
    await this.request(
      'POST',
      `/v1/meetings/${encodeURIComponent(meetingId)}/cancel`,
      {
        userid: config.userId,
        instanceid: 1,
        reason_code: 1,
        reason_detail: reason,
      },
      config,
    )
  }

  async listParticipants(
    meetingId: string,
  ): Promise<TencentMeetingParticipant[]> {
    const config = this.getConfig()
    const rows: TencentMeetingParticipant[] = []
    let position: string | null = null

    do {
      const params = new URLSearchParams({
        userid: config.userId,
        size: '100',
      })
      if (position) params.set('pos', position)
      const response = await this.request<Record<string, unknown>>(
        'GET',
        `/v1/meetings/${encodeURIComponent(meetingId)}/participants?${params.toString()}`,
        null,
        config,
      )
      const participants = Array.isArray(response.participants)
        ? response.participants
        : []
      for (const [index, participantInput] of participants.entries()) {
        const participant = participantInput as Record<string, unknown>
        const rawDisplayName = String(participant.user_name ?? '')
        const displayName = this.decodeDisplayName(rawDisplayName)
        const externalUserId = participant.userid
          ? String(participant.userid)
          : null
        const uuid = participant.uuid ? String(participant.uuid) : ''
        const joinTime = this.toSeconds(participant.join_time)
        const leftTime = this.toSeconds(participant.left_time)
        const identity =
          externalUserId || uuid || `name:${displayName || 'unknown'}`
        rows.push({
          externalRecordKey: [
            identity,
            joinTime ?? 'unknown',
            leftTime ?? 'unknown',
            index,
          ].join(':'),
          externalUserId,
          externalIdentityKey: externalUserId
            ? `userid:${externalUserId}`
            : uuid
              ? `uuid:${uuid}`
              : `name:${displayName}`,
          rawDisplayName,
          displayName,
          joinedAtSeconds: joinTime,
          leftAtSeconds: leftTime,
          raw: participant,
        })
      }
      const hasRemaining =
        response.has_remaining === true ||
        response.has_remaining === 1 ||
        response.has_remaining === '1'
      position =
        hasRemaining && response.next_pos != null
          ? String(response.next_pos)
          : null
    } while (position)

    return rows
  }

  private getConfig(): TencentMeetingConfig {
    const appId = this.configService.get<string>('TENCENT_MEETING_APP_ID')
    const secretId = this.configService.get<string>(
      'TENCENT_MEETING_SECRET_ID',
    )
    const secretKey = this.configService.get<string>(
      'TENCENT_MEETING_SECRET_KEY',
    )
    const userId = this.configService.get<string>('TENCENT_MEETING_USER_ID')
    if (!appId || !secretId || !secretKey || !userId) {
      throw new Error('腾讯会议接口尚未配置')
    }
    return {
      appId,
      sdkId:
        this.configService.get<string>('TENCENT_MEETING_SDK_ID') || null,
      secretId,
      secretKey,
      userId,
    }
  }

  private async request<T = Record<string, never>>(
    method: string,
    requestUri: string,
    payload: Record<string, unknown> | null,
    config: TencentMeetingConfig,
  ): Promise<T> {
    const body = payload ? JSON.stringify(payload) : ''
    const timestamp = String(Math.floor(Date.now() / 1000))
    const nonce = String(randomInt(100_000, 1_000_000))
    const signature = createTencentMeetingSignature({
      method,
      requestUri,
      body,
      secretId: config.secretId,
      secretKey: config.secretKey,
      timestamp,
      nonce,
    })
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-TC-Key': config.secretId,
      'X-TC-Timestamp': timestamp,
      'X-TC-Nonce': nonce,
      'X-TC-Signature': signature,
      'X-TC-Registered': '1',
      AppId: config.appId,
    }
    if (config.sdkId) headers.SdkId = config.sdkId

    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${requestUri}`, {
        method,
        headers,
        body: body || undefined,
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new Error('腾讯会议接口网络请求失败')
    }

    const text = await response.text()
    let parsed: Record<string, unknown> = {}
    if (text) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>
      } catch {
        if (!response.ok) {
          throw new Error(`腾讯会议接口请求失败（HTTP ${response.status}）`)
        }
        throw new Error('腾讯会议接口返回了无法解析的数据')
      }
    }
    if (!response.ok || parsed.error_info) {
      const error = parsed.error_info as
        | { error_code?: unknown; message?: unknown }
        | undefined
      const code = error?.error_code ? ` ${String(error.error_code)}` : ''
      const message = error?.message ? `：${String(error.message)}` : ''
      throw new Error(`腾讯会议接口请求失败${code}${message}`)
    }
    return parsed as T
  }

  private decodeDisplayName(value: string) {
    if (!value) return ''
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8').trim()
      const normalized = Buffer.from(decoded, 'utf8')
        .toString('base64')
        .replace(/=+$/u, '')
      if (normalized === value.replace(/=+$/u, '')) return decoded
    } catch {
      // Fall back to the original name when it is not valid Base64.
    }
    return value.trim()
  }

  private toSeconds(value: unknown) {
    const number = Number(value)
    return Number.isFinite(number) && number > 0 ? number : null
  }
}
