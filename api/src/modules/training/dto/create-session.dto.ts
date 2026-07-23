import { Type } from 'class-transformer'
import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator'

export class CreateSessionDto {
  @IsString()
  courseId!: string

  @IsOptional()
  @IsString()
  teacherId?: string

  @IsDateString()
  scheduledStartAt!: string

  @IsDateString()
  scheduledEndAt!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number
}
