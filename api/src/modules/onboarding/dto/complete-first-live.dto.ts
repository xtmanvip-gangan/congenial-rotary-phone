import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator'

export class CompleteFirstLiveDto {
  @IsDateString()
  firstLiveAt!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string
}
