import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { Type } from 'class-transformer'

export class UpdateSubmissionItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  itemName!: string

  @Type(() => Number)
  @Min(0)
  quantity!: number
}

export class UpdateSubmissionDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  anchorName?: string

  @IsString()
  @IsOptional()
  operatorId?: string

  @IsDateString()
  liveDate!: string

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  liveStartTime!: string

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSubmissionItemDto)
  items?: UpdateSubmissionItemDto[]

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  pkValue?: number

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  attachmentUrls!: string[]
}
