import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export class ExportSubmissionsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  token?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  activityId?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  activityName?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  anchorName?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  operatorName?: string

  @IsOptional()
  @IsString()
  @IsIn(['pending', 'approved', 'rejected'])
  reviewStatus?: 'pending' | 'approved' | 'rejected'

  @IsOptional()
  @IsString()
  @IsIn(['pending', 'granted'])
  grantStatus?: 'pending' | 'granted'

  @IsOptional()
  @IsDateString()
  liveDateStart?: string

  @IsOptional()
  @IsDateString()
  liveDateEnd?: string
}
