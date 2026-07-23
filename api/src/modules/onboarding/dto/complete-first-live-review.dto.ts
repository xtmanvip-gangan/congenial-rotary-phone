import { IsString, MaxLength } from 'class-validator'

export class CompleteFirstLiveReviewDto {
  @IsString()
  @MaxLength(1000)
  note!: string
}
