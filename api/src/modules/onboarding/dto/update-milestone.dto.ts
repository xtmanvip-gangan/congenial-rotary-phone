import { IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateMilestoneDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string
}
