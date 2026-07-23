import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'

export class CreateTrainingRecommendationDto {
  @IsUUID()
  anchorProfileId!: string

  @IsUUID()
  courseId!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string
}
