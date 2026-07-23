import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export enum TrainingApplicationStatusDto {
  unobserved = 'unobserved',
  practicing = 'practicing',
  applied = 'applied',
  needs_support = 'needs_support',
}

export class UpdateTrainingFeedbackDto {
  @IsEnum(TrainingApplicationStatusDto)
  status!: TrainingApplicationStatusDto

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observationNote?: string

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  replayIssue?: string

  @IsOptional()
  @IsUUID()
  nextCourseId?: string

  @IsOptional()
  @IsBoolean()
  interventionNeeded?: boolean
}

class BulkTrainingFeedbackItemDto extends UpdateTrainingFeedbackDto {
  @IsUUID()
  id!: string
}

export class BulkUpdateTrainingFeedbackDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkTrainingFeedbackItemDto)
  items!: BulkTrainingFeedbackItemDto[]
}

export enum TrainingQuestionUrgencyDto {
  normal = 'normal',
  urgent = 'urgent',
}

export class CreateTrainingQuestionDto {
  @IsOptional()
  @IsUUID()
  anchorProfileId?: string

  @IsOptional()
  @IsUUID()
  courseId?: string

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string

  @IsEnum(TrainingQuestionUrgencyDto)
  urgency!: TrainingQuestionUrgencyDto

  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  description!: string

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  caseNote?: string
}

export enum TrainingQuestionResolutionTypeDto {
  standard_course = 'standard_course',
  review_session = 'review_session',
  saturday_qa = 'saturday_qa',
  special_course = 'special_course',
  new_course_need = 'new_course_need',
  operator_followup = 'operator_followup',
}

export class ResolveTrainingQuestionDto {
  @IsEnum(TrainingQuestionResolutionTypeDto)
  resolutionType!: TrainingQuestionResolutionTypeDto

  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  note!: string
}

export class CreateTrainingWeeklyMeetingDto {
  @IsDateString()
  weekStart!: string

  @IsOptional()
  @IsDateString()
  heldAt?: string

  @IsArray()
  @IsUUID('4', { each: true })
  attendeeIds!: string[]

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string
}

export class CreateTrainingWeeklyActionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string

  @IsOptional()
  @IsUUID()
  ownerAccountId?: string

  @IsOptional()
  @IsDateString()
  dueAt?: string
}
