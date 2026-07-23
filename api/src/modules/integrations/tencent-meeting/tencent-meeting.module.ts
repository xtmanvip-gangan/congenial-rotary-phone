import { Module } from '@nestjs/common'
import { TencentMeetingClient } from './tencent-meeting.client.js'
import { TENCENT_MEETING_GATEWAY } from './tencent-meeting.types.js'

@Module({
  providers: [
    TencentMeetingClient,
    {
      provide: TENCENT_MEETING_GATEWAY,
      useExisting: TencentMeetingClient,
    },
  ],
  exports: [TENCENT_MEETING_GATEWAY],
})
export class TencentMeetingModule {}
