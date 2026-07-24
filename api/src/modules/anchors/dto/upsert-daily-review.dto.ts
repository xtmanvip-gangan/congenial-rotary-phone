import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

/** 附件六：《主播日复盘表》 */
export class UpsertDailyReviewDto {
  @IsDateString()
  reviewDate!: string

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  liveDurationMinutes?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  sessionViewers?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  peakOnline?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  avgOnline?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  newFans?: number | null

  @IsOptional()
  @IsNumber()
  @Min(0)
  giftRevenueYuan?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  pkCount?: number | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bestThing?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  biggestProblem?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  tomorrowFocus?: string | null
}

export class UpdateLeaderNoteDto {
  @IsString()
  @MaxLength(2000)
  leaderNote!: string
}
