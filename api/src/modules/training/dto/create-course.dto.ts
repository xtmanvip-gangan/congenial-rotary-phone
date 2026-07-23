import { Type } from 'class-transformer'
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export enum TrainingCourseLevelDto {
  basic_required = 'basic_required',
  growth = 'growth',
  advanced = 'advanced',
  special = 'special',
}

export class TrainingMaterialLinkDto {
  @IsString()
  @MaxLength(120)
  title!: string

  @IsUrl({ require_protocol: true })
  url!: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number
}

export class CreateCourseDto {
  @IsString()
  @MaxLength(30)
  code!: string

  @IsString()
  @MaxLength(120)
  title!: string

  @IsEnum(TrainingCourseLevelDto)
  level!: TrainingCourseLevelDto

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
}
