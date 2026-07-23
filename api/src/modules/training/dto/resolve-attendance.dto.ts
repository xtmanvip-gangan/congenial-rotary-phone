import { IsEnum, IsString, IsUUID, MinLength } from 'class-validator'

export class ResolveAttendanceMatchDto {
  @IsUUID()
  anchorProfileId!: string

  @IsString()
  @MinLength(2)
  reason!: string
}

export enum AttendanceOutcomeDto {
  learned = 'learned',
  needs_makeup = 'needs_makeup',
}

export class ResolveAttendanceOutcomeDto {
  @IsEnum(AttendanceOutcomeDto)
  outcome!: AttendanceOutcomeDto

  @IsString()
  @MinLength(2)
  reason!: string
}
