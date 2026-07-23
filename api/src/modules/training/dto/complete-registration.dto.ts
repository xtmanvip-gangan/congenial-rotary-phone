import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator'

export enum TrainingOutcomeDto {
  learned = 'learned',
  leave = 'leave',
  absent = 'absent',
  abnormal_exit = 'abnormal_exit',
  needs_makeup = 'needs_makeup',
}

export class CompleteRegistrationDto {
  @IsEnum(TrainingOutcomeDto)
  status!: TrainingOutcomeDto

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string
}

export class CancelTrainingSessionDto {
  @IsString()
  @MaxLength(500)
  reason!: string
}
