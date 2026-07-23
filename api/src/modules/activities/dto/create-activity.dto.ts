import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateActivityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  typeCode!: string

  @IsDateString()
  startAt!: string

  @IsDateString()
  endAt!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @IsOptional()
  @IsString()
  coverUrl?: string

  @IsOptional()
  @IsString()
  @IsIn(['draft', 'active', 'ended', 'disabled'])
  status?: 'draft' | 'active' | 'ended' | 'disabled'
}
