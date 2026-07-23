import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export class ActivityConfigItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  itemCode!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  itemName!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  itemType!: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class ActivityConfigRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  itemCode?: string

  @IsOptional()
  @IsString()
  @IsIn(['gte', 'eq'])
  compareMode?: 'gte' | 'eq'

  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: '奖励阈值必须是有效数字' },
  )
  threshold!: number

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  rewardType!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  rewardLabel!: string

  @Type(() => Number)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: '奖励价值必须是有效金额' },
  )
  @Min(0)
  rewardValueYuan!: number

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class SaveActivityConfigDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ActivityConfigItemDto)
  items!: ActivityConfigItemDto[]

  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => ActivityConfigRuleDto)
  rules!: ActivityConfigRuleDto[]
}
