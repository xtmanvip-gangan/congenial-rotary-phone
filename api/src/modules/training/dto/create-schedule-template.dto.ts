import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator'

export enum TrainingWeekParityDto {
  every = 'every',
  a = 'a',
  b = 'b',
}

export class CreateScheduleTemplateDto {
  @IsString()
  courseId!: string

  @IsOptional()
  @IsString()
  teacherId?: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  weekday!: number

  @IsEnum(TrainingWeekParityDto)
  weekParity!: TrainingWeekParityDto

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  durationMinutes!: number

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number

  @IsOptional()
  @IsBoolean()
  active?: boolean
}
