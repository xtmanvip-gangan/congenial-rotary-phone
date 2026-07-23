import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateReviewStatusDto {
  @IsString()
  @IsIn(['approved', 'rejected'])
  status!: 'approved' | 'rejected'

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectReason?: string
}
