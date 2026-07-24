import { Type } from 'class-transformer'
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator'

export class SubmitMilestoneDto {
  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  attachmentUrls?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string
}

export class RejectMilestoneDto {
  @IsString()
  @MaxLength(500)
  reason!: string
}

export class ConfirmMilestoneDto {
  /** 岗前培训确认勾选（仅 prejob_learning_completed） */
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  checklist?: Record<string, boolean>
}
