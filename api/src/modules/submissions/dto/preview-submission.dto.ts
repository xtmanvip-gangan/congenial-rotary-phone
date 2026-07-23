import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export class PreviewSubmissionItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  itemName!: string

  @Type(() => Number)
  @Min(0)
  quantity!: number
}

export class PreviewSubmissionDto {
  @IsString()
  @IsNotEmpty()
  activityId!: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  submissionId?: string

  @IsDateString()
  liveDate!: string

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PreviewSubmissionItemDto)
  items?: PreviewSubmissionItemDto[]

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  pkValue?: number
}
