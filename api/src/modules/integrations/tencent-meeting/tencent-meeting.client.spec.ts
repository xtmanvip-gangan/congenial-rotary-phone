import { createHmac } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTencentMeetingSignature,
  TencentMeetingClient,
} from './tencent-meeting.client.js'

describe('TencentMeetingClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('按腾讯会议企业自建应用规则生成确定签名', () => {
    const input = {
      method: 'POST',
      requestUri: '/v1/meetings',
      body: '{"userid":"training-center","instanceid":1}',
      secretId: 'secret-id',
      secretKey: 'secret-key',
      timestamp: '1700000000',
      nonce: '123456',
    }
    const stringToSign = [
      'POST',
      'X-TC-Key=secret-id&X-TC-Nonce=123456&X-TC-Timestamp=1700000000',
      '/v1/meetings',
      input.body,
    ].join('\n')
    const hex = createHmac('sha256', 'secret-key')
      .update(stringToSign)
      .digest('hex')
      .toLowerCase()
    const expected = Buffer.from(hex).toString('base64')

    expect(createTencentMeetingSignature(input)).toBe(expected)
  })

  it('创建会议时发送公共鉴权头并规范化返回值', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          meeting_number: 1,
          meeting_info_list: [
            {
              meeting_id: 'meeting-1',
              meeting_code: '123456789',
              join_url: 'https://meeting.tencent.com/dm/example',
            },
          ],
        }),
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    vi.spyOn(Math, 'random').mockReturnValue(0.123456)
    const client = new TencentMeetingClient(
      new ConfigService({
        TENCENT_MEETING_APP_ID: 'app-id',
        TENCENT_MEETING_SDK_ID: 'sdk-id',
        TENCENT_MEETING_SECRET_ID: 'secret-id',
        TENCENT_MEETING_SECRET_KEY: 'secret-key',
        TENCENT_MEETING_USER_ID: 'training-center',
      }),
    )

    const result = await client.createMeeting({
      subject: '主播基础课 1',
      startAt: new Date('2026-07-24T10:00:00.000Z'),
      endAt: new Date('2026-07-24T11:00:00.000Z'),
    })

    expect(result).toMatchObject({
      meetingId: 'meeting-1',
      meetingCode: '123456789',
      joinUrl: 'https://meeting.tencent.com/dm/example',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.meeting.qq.com/v1/meetings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          AppId: 'app-id',
          SdkId: 'sdk-id',
          'X-TC-Key': 'secret-id',
          'X-TC-Registered': '1',
          'X-TC-Timestamp': '1700000000',
        }),
      }),
    )
  })

  it('分页拉取参会成员并解码 Base64 展示名', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            participants: [
              {
                uuid: 'uuid-1',
                userid: 'wecom-1',
                user_name: Buffer.from('主播甲').toString('base64'),
                join_time: '1700000000',
                left_time: '1700000300',
              },
            ],
            has_remaining: true,
            next_pos: 'next-page',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            participants: [
              {
                uuid: 'uuid-1',
                userid: 'wecom-1',
                user_name: Buffer.from('主播甲').toString('base64'),
                join_time: '1700000400',
                left_time: '1700000700',
              },
            ],
            has_remaining: false,
          }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const client = new TencentMeetingClient(
      new ConfigService({
        TENCENT_MEETING_APP_ID: 'app-id',
        TENCENT_MEETING_SECRET_ID: 'secret-id',
        TENCENT_MEETING_SECRET_KEY: 'secret-key',
        TENCENT_MEETING_USER_ID: 'training-center',
      }),
    )

    const rows = await client.listParticipants('meeting-1')

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      externalUserId: 'wecom-1',
      displayName: '主播甲',
      joinedAtSeconds: 1_700_000_000,
      leftAtSeconds: 1_700_000_300,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('pos=next-page')
  })

  it('缺少配置时在发起网络请求前失败', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = new TencentMeetingClient(new ConfigService({}))

    await expect(
      client.createMeeting({
        subject: '测试课',
        startAt: new Date(),
        endAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow('腾讯会议接口尚未配置')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
