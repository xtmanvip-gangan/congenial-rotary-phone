import { Type } from 'class-transformer'
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import {
  TrainingCourseLevelDto,
  TrainingMaterialLinkDto,
} from './create-course.dto.js'

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string

  @IsOptional()
  @IsEnum(TrainingCourseLevelDto)
  level?: TrainingCourseLevelDto

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence?: number

  @IsOptional()
  @IsString()
  summary?: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectives?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  practiceTasks?: string[]

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  faq?: string[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainingMaterialLinkDto)
  materialLinks?: TrainingMaterialLinkDto[]

  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: string
}
