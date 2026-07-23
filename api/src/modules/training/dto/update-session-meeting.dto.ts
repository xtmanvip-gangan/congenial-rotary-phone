import { IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateSessionMeetingDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  meetingCode?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  joinUrl?: string | null
}
